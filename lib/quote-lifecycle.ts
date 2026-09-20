import { Prisma } from "@prisma/client";
import type { Business, Quote, QuoteEventType, QuoteStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { track } from "@/lib/analytics";
import { sendEmail } from "@/lib/email/send";
import { quoteAcceptedEmail } from "@/lib/email/templates";
import { getAppUrl } from "@/lib/env";
import { canCreateQuote, QuoteLimitReachedError } from "@/lib/billing/entitlements";
import { runSideEffect } from "@/lib/side-effects";
import { computeQuoteTotals, type QuoteInput } from "@/lib/validation/quote";
import {
  isFinalized,
  isPastValidUntil,
  statusesAllowedToTransitionTo,
  OPEN_STATUSES,
} from "@/lib/quote-service";

export interface TransitionResult {
  /** True only for the request that actually performed the transition. */
  changed: boolean;
  /** The quote's status after the attempt, or null if the quote is gone. */
  status: QuoteStatus | null;
}

/**
 * The single way a quote changes status. The guard lives in the WHERE
 * clause of one UPDATE statement, so the check and the write happen as one
 * atomic database operation:
 *
 *   UPDATE "Quote" SET status = $to
 *   WHERE id = $id AND status IN (<statuses that may become $to>)
 *
 * Under Postgres' default READ COMMITTED isolation a second concurrent
 * UPDATE on the same row blocks until the first commits and then re-checks
 * its WHERE against the new row version — so it matches 0 rows and reports
 * `changed: false`. The lifecycle event is only written by the request that
 * actually won, which is what keeps events, emails and analytics from being
 * duplicated.
 */
export async function applyTransition(
  quoteId: string,
  to: QuoteStatus,
  options: {
    data?: Prisma.QuoteUpdateManyMutationInput;
    eventType?: QuoteEventType;
    /** Restricts the update to one tenant, making the ownership check atomic too. */
    businessId?: string;
  } = {}
): Promise<TransitionResult> {
  const scope = options.businessId ? { businessId: options.businessId } : {};

  return prisma.$transaction(async (tx) => {
    const updated = await tx.quote.updateMany({
      where: { id: quoteId, ...scope, status: { in: statusesAllowedToTransitionTo(to) } },
      data: { status: to, ...options.data },
    });

    if (updated.count === 0) {
      const current = await tx.quote.findFirst({
        where: { id: quoteId, ...scope },
        select: { status: true },
      });
      return { changed: false, status: current?.status ?? null };
    }

    if (options.eventType) {
      await tx.quoteEvent.create({ data: { quoteId, type: options.eventType } });
    }
    return { changed: true, status: to };
  });
}

/**
 * There is no cron/job yet (by design — see README), so expiration is
 * enforced lazily: every time a quote is touched (public page view, accept,
 * reject, cancel, follow-up) we first check whether its `validUntil` has
 * passed and, if so, flip it to EXPIRED before doing anything else. No-op
 * for quotes that are already finalized or not yet due.
 */
export async function settleExpiration(
  quote: Pick<Quote, "id" | "status" | "validUntil">
): Promise<QuoteStatus> {
  if (isFinalized(quote.status)) return quote.status;
  if (!isPastValidUntil(quote.validUntil)) return quote.status;

  const result = await applyTransition(quote.id, "EXPIRED", { eventType: "EXPIRED" });
  // On a lost race the other request already moved it somewhere final; its
  // status is the truth, not ours.
  return result.status ?? quote.status;
}

/**
 * Core logic behind the public "Aceptar presupuesto" button, without the
 * redirect — kept separate so it can be called from tests and from the
 * server action alike. Returns the quote's status after the attempt (which
 * may just be whatever finalized status it already was, if the accept was
 * blocked), or null if the token doesn't match any quote.
 */
export async function performAcceptQuote(token: string): Promise<QuoteStatus | null> {
  const quote = await prisma.quote.findUnique({
    where: { publicToken: token },
    include: { customer: true, business: { include: { owner: true } } },
  });
  if (!quote) return null;

  const status = await settleExpiration(quote);
  if (isFinalized(status)) return status;

  const result = await applyTransition(quote.id, "ACCEPTED", {
    data: { acceptedAt: new Date() },
    eventType: "ACCEPTED",
  });
  // Another request accepted/rejected/expired it first: report what actually
  // happened and send nothing, so the owner gets exactly one email.
  if (!result.changed) return result.status;

  // From here on the quote *is* accepted. Everything below is notification:
  // run independently so one failure doesn't cascade into the other, and
  // never let either of them turn a successful acceptance into an error.
  await runSideEffect("quote_accepted analytics", () =>
    track("quote_accepted", quote.businessId, { quoteId: quote.id })
  );
  await runSideEffect("acceptance email", () => {
    const email = quoteAcceptedEmail(
      quote.business.owner.name,
      quote.customer.name,
      quote.number,
      `${getAppUrl()}/presupuestos/${quote.id}`
    );
    return sendEmail({ to: quote.business.owner.email, subject: email.subject, html: email.html });
  });

  return "ACCEPTED";
}

/** Same as performAcceptQuote but for the "Rechazar" button. */
export async function performRejectQuote(token: string): Promise<QuoteStatus | null> {
  const quote = await prisma.quote.findUnique({ where: { publicToken: token } });
  if (!quote) return null;

  const status = await settleExpiration(quote);
  if (isFinalized(status)) return status;

  const result = await applyTransition(quote.id, "REJECTED", {
    data: { rejectedAt: new Date() },
    eventType: "REJECTED",
  });
  if (!result.changed) return result.status;

  await runSideEffect("quote_rejected analytics", () =>
    track("quote_rejected", quote.businessId, { quoteId: quote.id })
  );
  return "REJECTED";
}

/** Marks a DRAFT quote as sent. Only the first request to win the transition logs the event. */
export async function performMarkQuoteSent(
  businessId: string,
  quoteId: string
): Promise<QuoteStatus | null> {
  const result = await applyTransition(quoteId, "SENT", {
    data: { sentAt: new Date() },
    eventType: "SENT",
    businessId,
  });
  if (!result.changed) return result.status;

  await runSideEffect("quote_sent analytics", () => track("quote_sent", businessId, { quoteId }));
  return "SENT";
}

/**
 * Core logic behind "Cancelar presupuesto" (the professional-facing
 * action), tenant-scoped and separated from the "use server" wrapper so it
 * can be unit-tested directly. Only quotes in an open status (DRAFT/SENT/
 * VIEWED) can be cancelled — anything already finalized (including one that
 * just settled to EXPIRED) is left untouched.
 */
export async function performCancelQuote(
  businessId: string,
  quoteId: string
): Promise<QuoteStatus | null> {
  const quote = await prisma.quote.findFirst({ where: { id: quoteId, businessId } });
  if (!quote) return null;

  const status = await settleExpiration(quote);
  if (isFinalized(status)) return status;

  const result = await applyTransition(quoteId, "CANCELLED", {
    data: { cancelledAt: new Date(), deletedAt: new Date() },
    eventType: "CANCELLED",
    businessId,
  });
  return result.changed ? "CANCELLED" : result.status;
}

/**
 * Core logic behind recording a sent follow-up. Only makes sense for a
 * quote that's still open (SENT/VIEWED) — a follow-up on an ACCEPTED,
 * REJECTED, EXPIRED or CANCELLED quote is a no-op.
 */
export async function performRecordFollowUp(
  businessId: string,
  quoteId: string,
  message: string
): Promise<QuoteStatus | null> {
  const quote = await prisma.quote.findFirst({ where: { id: quoteId, businessId } });
  if (!quote) return null;

  const status = await settleExpiration(quote);
  if (!OPEN_STATUSES.includes(status)) return status;

  await prisma.$transaction([
    prisma.followUp.create({ data: { quoteId: quote.id, channel: "WHATSAPP", message } }),
    prisma.quoteEvent.create({ data: { quoteId: quote.id, type: "FOLLOWUP_SENT" } }),
  ]);
  await runSideEffect("followup_sent analytics", () =>
    track("followup_sent", businessId, { quoteId: quote.id })
  );
  return status;
}

/**
 * Creates a quote for a business, reserving its sequential number.
 *
 * The monthly plan limit is re-checked *inside* the transaction, after the
 * `business.update` that bumps `quoteCounter`. That update takes a row lock
 * on the Business row, so concurrent creates for the same business queue up
 * behind each other; by the time a waiting transaction runs its count, the
 * quote from the transaction ahead of it is already committed and visible.
 * Without this, two simultaneous requests could both read "4 of 5 used" and
 * both create, putting the business over its plan.
 *
 * Throws QuoteLimitReachedError (rolling the whole transaction back, so the
 * counter isn't consumed either) when the limit is hit.
 */
export async function performCreateQuote(
  business: Pick<Business, "id" | "currency">,
  input: QuoteInput,
  publicToken: string
) {
  const totals = computeQuoteTotals(input.items, input.discount);

  return prisma.$transaction(async (tx) => {
    const updatedBusiness = await tx.business.update({
      where: { id: business.id },
      data: { quoteCounter: { increment: 1 } },
    });

    const limit = await canCreateQuote(business.id, tx);
    if (!limit.allowed) throw new QuoteLimitReachedError(limit.reason);

    return tx.quote.create({
      data: {
        businessId: business.id,
        customerId: input.customerId,
        number: updatedBusiness.quoteCounter,
        publicToken,
        currency: business.currency,
        subtotal: totals.subtotal,
        discount: totals.discount,
        total: totals.total,
        notes: input.notes || null,
        conditions: input.conditions || null,
        validUntil: input.validUntil ? new Date(input.validUntil) : null,
        workDate: input.workDate ? new Date(input.workDate) : null,
        items: {
          create: input.items.map((item, index) => ({
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
}
