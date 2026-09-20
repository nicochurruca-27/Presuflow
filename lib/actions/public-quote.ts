"use server";

import { redirect } from "next/navigation";
import { performAcceptQuote, performRejectQuote } from "@/lib/quote-lifecycle";

export async function acceptQuoteAction(token: string) {
  await performAcceptQuote(token);
  redirect(`/q/${token}`);
}

export async function rejectQuoteAction(token: string) {
  await performRejectQuote(token);
  redirect(`/q/${token}`);
}
