import { prisma } from "@/lib/prisma";
import { needsFollowUp, daysSince } from "@/lib/quote-service";

export async function getDashboardData(businessId: string) {
  const quotes = await prisma.quote.findMany({
    where: { businessId, deletedAt: null },
    include: { customer: true },
    orderBy: { createdAt: "desc" },
  });

  const counts = {
    created: quotes.length,
    sent: quotes.filter((q) => q.status !== "DRAFT").length,
    viewed: quotes.filter((q) => q.status === "VIEWED" || q.status === "ACCEPTED").length,
    accepted: quotes.filter((q) => q.status === "ACCEPTED").length,
    pending: quotes.filter((q) => q.status === "SENT" || q.status === "VIEWED").length,
  };

  const totalQuoted = quotes
    .filter((q) => q.status !== "DRAFT" && q.status !== "CANCELLED")
    .reduce((sum, q) => sum + q.total, 0);
  const totalAccepted = quotes
    .filter((q) => q.status === "ACCEPTED")
    .reduce((sum, q) => sum + q.total, 0);

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
