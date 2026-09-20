import { Quote, QuoteStatus } from "@prisma/client";

/** A sent/viewed quote that has sat this long without a response is considered stale. */
export const FOLLOW_UP_THRESHOLD_DAYS = 3;

export function daysSince(date: Date) {
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

export function needsFollowUp(quote: Pick<Quote, "status" | "sentAt">) {
  if (quote.status !== "SENT" && quote.status !== "VIEWED") return false;
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
