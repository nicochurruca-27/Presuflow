"use server";

import { redirect } from "next/navigation";
import { performAcceptQuote, performRejectQuote } from "@/lib/quote-lifecycle";
import { rateLimit, rateLimitByIp, RATE_LIMITS } from "@/lib/rate-limit";
import { getRequestIp } from "@/lib/request-ip";

/**
 * Throttles hammering of a public quote link. This sits *on top of* the
 * atomic transition, it doesn't replace it: correctness comes from the
 * database guard, this only caps how much traffic one token or one source
 * can generate. The limit is deliberately loose so a customer clicking
 * twice, or reloading, never gets blocked.
 */
async function withinPublicQuoteLimit(token: string): Promise<boolean> {
  const ip = await getRequestIp();
  const [perToken, perIp] = await Promise.all([
    rateLimit(`public-quote:${token}`, RATE_LIMITS.publicQuoteAction),
    rateLimitByIp(ip, "public-quote-ip", RATE_LIMITS.publicQuoteAction),
  ]);
  return perToken.allowed && perIp.allowed;
}

export async function acceptQuoteAction(token: string) {
  if (await withinPublicQuoteLimit(token)) {
    await performAcceptQuote(token);
  }
  // Either way the customer lands back on the quote, which renders whatever
  // the current status actually is.
  redirect(`/q/${token}`);
}

export async function rejectQuoteAction(token: string) {
  if (await withinPublicQuoteLimit(token)) {
    await performRejectQuote(token);
  }
  redirect(`/q/${token}`);
}
