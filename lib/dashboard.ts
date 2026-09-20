import { prisma } from "@/lib/prisma";
import { needsFollowUp, daysSince, effectiveStatus } from "@/lib/quote-service";

export async function getDashboardData(businessId: string) {
  const quotes = await prisma.quote.findMany({
    where: { businessId, deletedAt: null },
    include: { customer: true },
    orderBy: { createdAt: "desc" },
  });

  // Counted on the effective status: a quote past its validUntil is not
  // pending, even though the database still says SENT until someone opens it.
  const withStatus = quotes.map((q) => ({ quote: q, status: effectiveStatus(q) }));

  const counts = {
    created: quotes.length,
    sent: withStatus.filter((q) => q.status !== "DRAFT").length,
    viewed: withStatus.filter((q) => q.status === "VIEWED" || q.status === "ACCEPTED").length,
    accepted: withStatus.filter((q) => q.status === "ACCEPTED").length,
    pending: withStatus.filter((q) => q.status === "SENT" || q.status === "VIEWED").length,
    expired: withStatus.filter((q) => q.status === "EXPIRED").length,
  };

  const totalQuoted = withStatus
    .filter((q) => q.status !== "DRAFT" && q.status !== "CANCELLED")
    .reduce((sum, q) => sum + q.quote.total, 0);
  const totalAccepted = withStatus
    .filter((q) => q.status === "ACCEPTED")
    .reduce((sum, q) => sum + q.quote.total, 0);

  const needingFollowUp = quotes
    .filter((q) => needsFollowUp(q))
    .map((q) => ({
      id: q.id,
      customerName: q.customer.name,
      number: q.number,
      total: q.total,
      currency: q.currency,
      daysSinceSent: q.sentAt ? daysSince(q.sentAt) : 0,
    }))
    .sort((a, b) => b.daysSinceSent - a.daysSinceSent);

  return { counts, totalQuoted, totalAccepted, needingFollowUp, recentQuotes: quotes.slice(0, 5) };
}
