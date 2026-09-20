import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/log";
import { track } from "@/lib/analytics";
import { applyTransition } from "@/lib/quote-lifecycle";
import type { Quote } from "@prisma/client";

/**
 * Called once per page load of the public quote page. Every load is logged
 * as a QuoteView row (they represent real page loads, so duplicates are
 * expected and wanted). The SENT -> VIEWED status change, on the other
 * hand, must happen exactly once: it goes through the atomic transition, so
 * if two people open the link at the same moment only one of them writes
 * the VIEWED event and fires the analytics.
 */
export async function recordQuoteView(quote: Quote, userAgent: string | null) {
  try {
    await prisma.quoteView.create({ data: { quoteId: quote.id, userAgent } });

    const result = await applyTransition(quote.id, "VIEWED", { eventType: "VIEWED" });
    if (result.changed) {
      await track("quote_viewed", quote.businessId, { quoteId: quote.id });
    }
  } catch (err) {
    logError("quote-view", err);
  }
}
