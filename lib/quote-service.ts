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

const FINAL_STATUSES: QuoteStatus[] = ["ACCEPTED", "REJECTED", "CANCELLED"];

/** A quote in one of these states is done — the public page must not allow accept/reject anymore. */
export function isFinalized(status: QuoteStatus) {
  return FINAL_STATUSES.includes(status);
}
