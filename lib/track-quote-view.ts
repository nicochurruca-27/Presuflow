import { prisma } from "@/lib/prisma";
import { track } from "@/lib/analytics";
import type { Quote } from "@prisma/client";

/**
 * Called once per page load of the public quote page. Logs a view row always,
 * and on the very first view (SENT -> VIEWED) also flips the status and fires
 * the lifecycle event + product analytics.
 */
export async function recordQuoteView(quote: Quote, userAgent: string | null) {
  try {
    await prisma.quoteView.create({ data: { quoteId: quote.id, userAgent } });

    if (quote.status === "SENT") {
      await prisma.$transaction([
        prisma.quote.update({ where: { id: quote.id }, data: { status: "VIEWED" } }),
        prisma.quoteEvent.create({ data: { quoteId: quote.id, type: "VIEWED" } }),
      ]);
      await track("quote_viewed", quote.businessId, { quoteId: quote.id });
    }
  } catch (err) {
    console.error("[quote-view] failed to record view", err);
  }
}
