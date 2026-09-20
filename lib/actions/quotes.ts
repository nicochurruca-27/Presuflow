"use server";

import { nanoid } from "nanoid";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireBusiness } from "@/lib/auth-helpers";
import { quoteSchema, aiDraftSchema, aiTextSchema, followUpSchema } from "@/lib/validation/quote";
import { canCreateQuote, canUseAi } from "@/lib/billing/entitlements";
import { track } from "@/lib/analytics";
import { runSideEffect } from "@/lib/side-effects";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { aiProvider } from "@/lib/ai";
import { AiNotConfiguredError, AiPayloadTooLargeError } from "@/lib/ai/provider";
import { AiResponseError } from "@/lib/ai/json";
import { logError, redactSecrets } from "@/lib/log";
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
  // Same ceiling as the other three AI operations, checked before the call so
  // an exhausted quota costs nothing at the provider. The difference is what
  // happens next: this action has a written fallback, so going over the limit
  // degrades to the template below instead of surfacing an error. The user
  // still gets a usable message, which is the whole contract of this action.
  const aiAllowed = canAi && (await withinAiLimit(business.id));
  if (aiAllowed) {
    try {
      const message = await aiProvider.generateFollowUpMessage({
        customerName: firstName(quote.customer.name),
        businessName: business.name,
        quoteNumber: quote.number,
        daysSinceSent: Math.floor((Date.now() - quote.sentAt.getTime()) / (1000 * 60 * 60 * 24)),
      });
      if (message) return { message, aiGenerated: true };
    } catch (err) {
      // Best effort: any failure just falls through to the written template
      // below, so the user always gets a usable message.
      if (!(err instanceof AiNotConfiguredError)) logError("ai:seguimiento", err);
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

export async function recordFollowUpAction(
  quoteId: string,
  message: string
): Promise<{ error?: string }> {
  const { business } = await requireBusiness();

  // The message is free text the user can edit before sending, and it goes
  // straight into the database, so it gets the same treatment as any other
  // input rather than being trusted because the app suggested it.
  const parsed = followUpSchema.safeParse({ quoteId, message });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisá el mensaje." };
  }

  await performRecordFollowUp(business.id, parsed.data.quoteId, parsed.data.message);
  revalidatePath(`/presupuestos/${quoteId}`);
  return {};
}

/**
 * Every AI call costs money at the provider, and a Server Action can be
 * invoked in a loop just as easily as by clicking a button. Two windows per
 * business: a burst limit and a daily ceiling.
 */
async function withinAiLimit(businessId: string): Promise<boolean> {
  const [perHour, perDay] = await Promise.all([
    rateLimit(`ai-hour:${businessId}`, RATE_LIMITS.aiPerHour),
    rateLimit(`ai-day:${businessId}`, RATE_LIMITS.aiPerDay),
  ]);
  return perHour.allowed && perDay.allowed;
}

const AI_LIMIT_MESSAGE =
  "Alcanzaste el máximo de usos de IA por ahora. Probá de nuevo en un rato o cargá los datos a mano.";

/**
 * Turns any AI failure into something safe to show.
 *
 * Nothing the provider said reaches the browser: a malformed reply, an HTTP
 * error and a bug all become one of our own messages. The technical detail
 * goes to the server log, trimmed to name and message so a stack trace or a
 * request body can't end up there either.
 */
function aiErrorMessage(err: unknown, label: string, fallback: string): string {
  if (err instanceof AiNotConfiguredError) return err.message;
  if (err instanceof AiPayloadTooLargeError) return err.message;

  if (err instanceof AiResponseError) {
    console.error(`[ai] ${label}: respuesta inválida`, { detail: redactSecrets(err.detail) });
    return "La IA devolvió una respuesta que no pudimos usar. Probá de nuevo o cargá los datos a mano.";
  }

  logError(`ai:${label}`, err);
  return fallback;
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

  if (!(await withinAiLimit(business.id))) return { error: AI_LIMIT_MESSAGE };

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
    return {
      error: aiErrorMessage(
        err,
        "borrador",
        "No pudimos generar el borrador con IA. Probá de nuevo o cargalo manualmente."
      ),
    };
  }
}

export async function improveDescriptionAction(text: string): Promise<{ text?: string; error?: string }> {
  const { business } = await requireBusiness();
  const allowed = await canUseAi(business.id);
  if (!allowed) return { error: "Disponible desde el plan Starter." };

  const parsedText = aiTextSchema.safeParse(text);
  if (!parsedText.success) {
    return { error: parsedText.error.issues[0]?.message ?? "Revisá el texto." };
  }

  if (!(await withinAiLimit(business.id))) return { error: AI_LIMIT_MESSAGE };

  try {
    const improved = await aiProvider.improveDescription(parsedText.data);
    return { text: improved };
  } catch (err) {
    return { error: aiErrorMessage(err, "mejorar descripción", "No pudimos mejorar el texto. Probá de nuevo.") };
  }
}

export async function generateConditionsAction(): Promise<{ text?: string; error?: string }> {
  const { business } = await requireBusiness();
  const allowed = await canUseAi(business.id);
  if (!allowed) return { error: "Disponible desde el plan Starter." };

  if (!(await withinAiLimit(business.id))) return { error: AI_LIMIT_MESSAGE };

  try {
    const text = await aiProvider.generateConditions(business.activity ?? "servicios");
    return { text };
  } catch (err) {
    return {
      error: aiErrorMessage(err, "condiciones", "No pudimos generar las condiciones. Probá de nuevo."),
    };
  }
}
