import type { Quote, QuoteStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { track } from "@/lib/analytics";
import { sendEmail } from "@/lib/email/send";
import { quoteAcceptedEmail } from "@/lib/email/templates";
import { getAppUrl } from "@/lib/env";
import { isFinalized, isPastValidUntil, OPEN_STATUSES } from "@/lib/quote-service";

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

  await prisma.$transaction([
    prisma.quote.update({ where: { id: quote.id }, data: { status: "EXPIRED" } }),
    prisma.quoteEvent.create({ data: { quoteId: quote.id, type: "EXPIRED" } }),
  ]);
  return "EXPIRED";
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

  await prisma.$transaction([
    prisma.quote.update({
      where: { id: quote.id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    }),
    prisma.quoteEvent.create({ data: { quoteId: quote.id, type: "ACCEPTED" } }),
  ]);
  await track("quote_accepted", quote.businessId, { quoteId: quote.id });

  const email = quoteAcceptedEmail(
    quote.business.owner.name,
    quote.customer.name,
    quote.number,
    `${getAppUrl()}/presupuestos/${quote.id}`
  );
  await sendEmail({ to: quote.business.owner.email, subject: email.subject, html: email.html });

  return "ACCEPTED";
}

/** Same as performAcceptQuote but for the "Rechazar" button. */
export async function performRejectQuote(token: string): Promise<QuoteStatus | null> {
  const quote = await prisma.quote.findUnique({ where: { publicToken: token } });
  if (!quote) return null;

  const status = await settleExpiration(quote);
  if (isFinalized(status)) return status;

  await prisma.$transaction([
    prisma.quote.update({
      where: { id: quote.id },
      data: { status: "REJECTED", rejectedAt: new Date() },
    }),
    prisma.quoteEvent.create({ data: { quoteId: quote.id, type: "REJECTED" } }),
  ]);
  await track("quote_rejected", quote.businessId, { quoteId: quote.id });
  return "REJECTED";
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

  await prisma.$transaction([
    prisma.quote.update({
      where: { id: quote.id },
      data: { status: "CANCELLED", cancelledAt: new Date(), deletedAt: new Date() },
    }),
    prisma.quoteEvent.create({ data: { quoteId: quote.id, type: "CANCELLED" } }),
  ]);
  return "CANCELLED";
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
  await track("followup_sent", businessId, { quoteId: quote.id });
  return status;
}
