"use server";

import { nanoid } from "nanoid";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireBusiness } from "@/lib/auth-helpers";
import { quoteSchema, computeQuoteTotals, aiDraftSchema } from "@/lib/validation/quote";
import { canCreateQuote, canUseAi } from "@/lib/billing/entitlements";
import { track } from "@/lib/analytics";
import { aiProvider } from "@/lib/ai";
import { AiNotConfiguredError } from "@/lib/ai/provider";
import { buildFollowUpMessage, firstName } from "@/lib/whatsapp";
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

  const totals = computeQuoteTotals(parsed.data.items, parsed.data.discount);

  const quote = await prisma.$transaction(async (tx) => {
    const updatedBusiness = await tx.business.update({
      where: { id: business.id },
      data: { quoteCounter: { increment: 1 } },
    });

    return tx.quote.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        number: updatedBusiness.quoteCounter,
        publicToken: nanoid(32),
        currency: business.currency,
        subtotal: totals.subtotal,
        discount: totals.discount,
        total: totals.total,
        notes: parsed.data.notes || null,
        conditions: parsed.data.conditions || null,
        validUntil: parsed.data.validUntil ? new Date(parsed.data.validUntil) : null,
        workDate: parsed.data.workDate ? new Date(parsed.data.workDate) : null,
        items: {
          create: parsed.data.items.map((item, index) => ({
            description: item.description,
            detail: item.detail || null,
            quantity: item.quantity,
            unitPrice: Math.round(item.unitPrice),
            total: Math.round(item.quantity * item.unitPrice),
            position: index,
          })),
        },
        events: { create: { type: "CREATED" } },
      },
    });
  });

  await track("quote_created", business.id, { quoteId: quote.id });
  revalidatePath("/presupuestos");
  revalidatePath("/dashboard");
  redirect(`/presupuestos/${quote.id}`);
}

export async function markQuoteSentAction(quoteId: string) {
  const { business } = await requireBusiness();
  const quote = await prisma.quote.findFirst({ where: { id: quoteId, businessId: business.id } });
  if (!quote) return;
  if (quote.status !== "DRAFT") return;

  await prisma.$transaction([
    prisma.quote.update({
      where: { id: quote.id },
      data: { status: "SENT", sentAt: new Date() },
    }),
    prisma.quoteEvent.create({ data: { quoteId: quote.id, type: "SENT" } }),
  ]);

  await track("quote_sent", business.id, { quoteId: quote.id });
  revalidatePath(`/presupuestos/${quoteId}`);
  revalidatePath("/presupuestos");
  revalidatePath("/dashboard");
}

export async function cancelQuoteAction(quoteId: string) {
  const { business } = await requireBusiness();
  const quote = await prisma.quote.findFirst({ where: { id: quoteId, businessId: business.id } });
  if (!quote || quote.status === "ACCEPTED") return;

  await prisma.$transaction([
    prisma.quote.update({
      where: { id: quote.id },
      data: { status: "CANCELLED", cancelledAt: new Date(), deletedAt: new Date() },
    }),
    prisma.quoteEvent.create({ data: { quoteId: quote.id, type: "CANCELLED" } }),
  ]);

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
  const quote = await prisma.quote.findFirst({ where: { id: quoteId, businessId: business.id } });
  if (!quote) return;

  await prisma.$transaction([
    prisma.followUp.create({
      data: { quoteId: quote.id, channel: "WHATSAPP", message },
    }),
    prisma.quoteEvent.create({ data: { quoteId: quote.id, type: "FOLLOWUP_SENT" } }),
  ]);

  await track("followup_sent", business.id, { quoteId: quote.id });
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
