"use server";

import { nanoid } from "nanoid";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireBusiness } from "@/lib/auth-helpers";
import { quoteSchema, aiDraftSchema } from "@/lib/validation/quote";
import { canCreateQuote, canUseAi } from "@/lib/billing/entitlements";
import { track } from "@/lib/analytics";
import { runSideEffect } from "@/lib/side-effects";
import { aiProvider } from "@/lib/ai";
import { AiNotConfiguredError } from "@/lib/ai/provider";
import { buildFollowUpMessage, firstName } from "@/lib/whatsapp";
import { OPEN_STATUSES } from "@/lib/quote-service";
import { QuoteLimitReachedError } from "@/lib/billing/entitlements";
import {
  settleExpiration,
  performCancelQuote,
  performCreateQuote,
  performMarkQuoteSent,
  performRecordFollowUp,
} from "@/lib/quote-lifecycle";
import type { ActionState } from "@/lib/actions/auth";

export async function createQuoteAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { business } = await requireBusiness();

  const limit = await canCreateQuote(business.id);
  if (!limit.allowed) {
    return { error: limit.reason };
  }

  let items: unknown;
  try {
    items = JSON.parse(String(formData.get("itemsJson") ?? "[]"));
  } catch {
    return { error: "Los ítems del presupuesto no son válidos" };
  }

  const parsed = quoteSchema.safeParse({
    customerId: formData.get("customerId"),
    items,
    discount: formData.get("discount") || 0,
    notes: formData.get("notes") ?? "",
    conditions: formData.get("conditions") ?? "",
    validUntil: formData.get("validUntil") ?? "",
    workDate: formData.get("workDate") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisá los datos del presupuesto" };
  }

  const customer = await prisma.customer.findFirst({
    where: { id: parsed.data.customerId, businessId: business.id },
  });
  if (!customer) return { error: "Elegí un cliente válido" };

  let quote;
  try {
    quote = await performCreateQuote(business, parsed.data, nanoid(32));
  } catch (err) {
    // The authoritative limit check runs inside the transaction, so a
    // request that lost a race against a concurrent create lands here.
    if (err instanceof QuoteLimitReachedError) return { error: err.message };
    throw err;
  }

  await runSideEffect("quote_created analytics", () =>
    track("quote_created", business.id, { quoteId: quote.id })
  );
  revalidatePath("/presupuestos");
  revalidatePath("/dashboard");
  redirect(`/presupuestos/${quote.id}`);
}

export async function markQuoteSentAction(quoteId: string) {
  const { business } = await requireBusiness();
  await performMarkQuoteSent(business.id, quoteId);

  revalidatePath(`/presupuestos/${quoteId}`);
  revalidatePath("/presupuestos");
  revalidatePath("/dashboard");
}

export async function cancelQuoteAction(quoteId: string) {
  const { business } = await requireBusiness();
  await performCancelQuote(business.id, quoteId);

  revalidatePath("/presupuestos");
  revalidatePath("/dashboard");
}

export async function generateFollowUpMessageAction(quoteId: string): Promise<{
  message: string;
  aiGenerated: boolean;
}> {
  const { business } = await requireBusiness();
  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, businessId: business.id },
    include: { customer: true },
  });
  if (!quote || !quote.sentAt) {
    return { message: "", aiGenerated: false };
  }

  const status = await settleExpiration(quote);
  if (!OPEN_STATUSES.includes(status)) {
    return { message: "", aiGenerated: false };
  }

  const canAi = await canUseAi(business.id);
  if (canAi) {
    try {
      const message = await aiProvider.generateFollowUpMessage({
        customerName: firstName(quote.customer.name),
        businessName: business.name,
        quoteNumber: quote.number,
        daysSinceSent: Math.floor((Date.now() - quote.sentAt.getTime()) / (1000 * 60 * 60 * 24)),
      });
      if (message) return { message, aiGenerated: true };
    } catch (err) {
      if (!(err instanceof AiNotConfiguredError)) console.error("[ai] follow-up failed", err);
    }
  }

  return {
    message: buildFollowUpMessage({
      customerFirstName: firstName(quote.customer.name),
      quoteNumber: quote.number,
    }),
    aiGenerated: false,
  };
}

export async function recordFollowUpAction(quoteId: string, message: string) {
  const { business } = await requireBusiness();
  await performRecordFollowUp(business.id, quoteId, message);
  revalidatePath(`/presupuestos/${quoteId}`);
}

export async function draftQuoteWithAiAction(
  prompt: string
): Promise<{ error?: string; items?: { description: string; detail: string; quantity: number; unitPrice: number | null }[]; missingInfo?: string[] }> {
  const { business } = await requireBusiness();

  const allowed = await canUseAi(business.id);
  if (!allowed) {
    return { error: "La creación con IA está disponible desde el plan Starter." };
  }

  const parsed = aiDraftSchema.safeParse({ prompt });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Contanos qué trabajo vas a presupuestar" };
  }

  try {
    const result = await aiProvider.draftQuoteFromText(parsed.data.prompt, business.currency);
    return {
      items: result.items.map((item) => ({
        description: item.description,
        detail: item.detail ?? "",
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
      missingInfo: result.missingInfo,
    };
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      return { error: err.message };
    }
    console.error("[ai] draft failed", err);
    return { error: "No pudimos generar el borrador con IA. Probá de nuevo o cargalo manualmente." };
  }
}

export async function improveDescriptionAction(text: string): Promise<{ text?: string; error?: string }> {
  const { business } = await requireBusiness();
  const allowed = await canUseAi(business.id);
  if (!allowed) return { error: "Disponible desde el plan Starter." };
  if (!text.trim()) return { error: "Escribí una descripción primero." };

  try {
    const improved = await aiProvider.improveDescription(text);
    return { text: improved };
  } catch (err) {
    if (err instanceof AiNotConfiguredError) return { error: err.message };
    return { error: "No pudimos mejorar el texto. Probá de nuevo." };
  }
}

export async function generateConditionsAction(): Promise<{ text?: string; error?: string }> {
  const { business } = await requireBusiness();
  const allowed = await canUseAi(business.id);
  if (!allowed) return { error: "Disponible desde el plan Starter." };

  try {
    const text = await aiProvider.generateConditions(business.activity ?? "servicios");
    return { text };
  } catch (err) {
    if (err instanceof AiNotConfiguredError) return { error: err.message };
    return { error: "No pudimos generar las condiciones. Probá de nuevo." };
  }
}
