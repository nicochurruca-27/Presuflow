import type { Prisma, Quote, QuoteStatus } from "@prisma/client";

/** A sent/viewed quote that has sat this long without a response is considered stale. */
export const FOLLOW_UP_THRESHOLD_DAYS = 3;

export function daysSince(date: Date) {
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

export function needsFollowUp(quote: Pick<Quote, "status" | "sentAt" | "validUntil">) {
  // Deliberately the effective status, not the stored one: chasing a quote
  // that already expired is exactly the follow-up you don't want to send.
  if (!OPEN_STATUSES.includes(effectiveStatus(quote))) return false;
  if (!quote.sentAt) return false;
  return daysSince(quote.sentAt) >= FOLLOW_UP_THRESHOLD_DAYS;
}

export const OPEN_STATUSES: QuoteStatus[] = ["SENT", "VIEWED"];

const FINAL_STATUSES: QuoteStatus[] = ["ACCEPTED", "REJECTED", "EXPIRED", "CANCELLED"];

/** A quote in one of these states is done — the public page must not allow accept/reject anymore. */
export function isFinalized(status: QuoteStatus) {
  return FINAL_STATUSES.includes(status);
}

/**
 * Single source of truth for which status changes are legal. Every place
 * that moves a quote from one status to another must go through
 * `canTransition` instead of re-deriving its own rule — that's what let
 * `cancelQuoteAction` drift into only blocking ACCEPTED instead of every
 * final status.
 */
export const QUOTE_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  DRAFT: ["SENT", "CANCELLED"],
  SENT: ["VIEWED", "ACCEPTED", "REJECTED", "EXPIRED", "CANCELLED"],
  VIEWED: ["ACCEPTED", "REJECTED", "EXPIRED", "CANCELLED"],
  ACCEPTED: [],
  REJECTED: [],
  EXPIRED: [],
  CANCELLED: [],
};

export function canTransition(from: QuoteStatus, to: QuoteStatus): boolean {
  return QUOTE_TRANSITIONS[from].includes(to);
}

/**
 * Every status a quote is allowed to be in for `to` to be a legal next
 * status. This is what the atomic `UPDATE ... WHERE status IN (...)` guard
 * uses, so the database-level race protection is derived from the same
 * transition map rather than repeating the rule in SQL.
 */
export function statusesAllowedToTransitionTo(to: QuoteStatus): QuoteStatus[] {
  return (Object.keys(QUOTE_TRANSITIONS) as QuoteStatus[]).filter((from) =>
    canTransition(from, to)
  );
}

/**
 * Decision: `validUntil` is a plain date (from a date picker), stored as
 * midnight UTC of that day. A quote is treated as expired as soon as that
 * instant has passed — i.e. "valid until Sept 25" expires at the start of
 * Sept 25, not the end of it. Simpler and unambiguous; documented here
 * because a "valid through end of day" reading would also be defensible.
 */
export function isPastValidUntil(validUntil: Date | null): boolean {
  return validUntil !== null && validUntil.getTime() < Date.now();
}

/**
 * Turns a `?status=` query string into a filter we can hand to Prisma.
 *
 * Anything else becomes "ALL". Passing an unrecognised value straight
 * through would reach Prisma as an invalid enum member, which throws and
 * renders the whole page as a 500 — a URL anyone can type should never do
 * that.
 */
export function parseStatusFilter(value: string | undefined): QuoteStatus | "ALL" {
  if (!value || value === "ALL") return "ALL";
  const known = Object.keys(QUOTE_TRANSITIONS) as QuoteStatus[];
  return known.includes(value as QuoteStatus) ? (value as QuoteStatus) : "ALL";
}

/**
 * What a quote *is* right now, as opposed to what the database last wrote.
 *
 * Expiration is settled lazily (Bloque 1): a quote only becomes EXPIRED in
 * the database when someone opens it. That's the right trade-off — no cron,
 * no background job — but it means a list rendered straight from `status`
 * shows "Enviado" for a quote that anybody opening it would see as
 * "Vencido". This closes that gap for display, without writing anything.
 *
 * It mirrors `settleExpiration` exactly, including the part that's easy to
 * get wrong: only an open quote can expire. A DRAFT past its validUntil
 * stays a DRAFT, because DRAFT -> EXPIRED isn't a legal transition.
 */
export function effectiveStatus(quote: Pick<Quote, "status" | "validUntil">): QuoteStatus {
  if (!OPEN_STATUSES.includes(quote.status)) return quote.status;
  return isPastValidUntil(quote.validUntil) ? "EXPIRED" : quote.status;
}

/**
 * The `where` clause behind the status filter on the quotes list.
 *
 * Same problem as above, seen from the database side: filtering by SENT with
 * a plain `status: "SENT"` returns quotes that are really expired, and
 * filtering by EXPIRED misses every quote nobody has opened yet. So the
 * overdue ones are moved across here, in the query, rather than fetching
 * everything and filtering in memory.
 */
export function quoteListWhere(
  filter: QuoteStatus | "ALL",
  now: Date = new Date()
): Prisma.QuoteWhereInput {
  if (filter === "ALL") return {};

  const overdue: Prisma.QuoteWhereInput = {
    status: { in: OPEN_STATUSES },
    validUntil: { lt: now },
  };

  if (filter === "EXPIRED") {
    return { OR: [{ status: "EXPIRED" }, overdue] };
  }

  if (OPEN_STATUSES.includes(filter)) {
    return {
      status: filter,
      OR: [{ validUntil: null }, { validUntil: { gte: now } }],
    };
  }

  return { status: filter };
}
