import { PlanId, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * A Prisma client or an interactive-transaction client. Entitlement checks
 * accept either so the authoritative check can run inside the same
 * transaction that creates the record it's gating.
 */
type DbClient = Prisma.TransactionClient;

/** Thrown when a quota check fails inside a transaction, so the whole transaction rolls back. */
export class QuoteLimitReachedError extends Error {
  constructor(message?: string) {
    super(message ?? "Llegaste al límite de presupuestos de tu plan.");
    this.name = "QuoteLimitReachedError";
  }
}

export interface PlanLimits {
  label: string;
  maxQuotesPerMonth: number | null; // null = unlimited
  maxCustomers: number | null;
  ai: boolean;
  customBranding: boolean;
  priceLabel: string;
}

/**
 * Single source of truth for what each plan allows. Everything that gates a
 * feature by plan must read from here — never hardcode a limit inline.
 */
export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  FREE: {
    label: "Free",
    maxQuotesPerMonth: 5,
    maxCustomers: 15,
    ai: false,
    customBranding: false,
    priceLabel: "$0",
  },
  STARTER: {
    label: "Starter",
    maxQuotesPerMonth: 50,
    maxCustomers: null,
    ai: true,
    customBranding: true,
    priceLabel: "USD 9/mes",
  },
  PRO: {
    label: "Pro",
    maxQuotesPerMonth: null,
    maxCustomers: null,
    ai: true,
    customBranding: true,
    priceLabel: "USD 19/mes",
  },
};

export async function getBusinessPlan(
  businessId: string,
  db: DbClient = prisma
): Promise<PlanId> {
  const sub = await db.subscription.findUnique({ where: { businessId } });
  return sub?.plan ?? "FREE";
}

export async function canCreateQuote(
  businessId: string,
  db: DbClient = prisma
): Promise<{
  allowed: boolean;
  reason?: string;
}> {
  const plan = await getBusinessPlan(businessId, db);
  const limits = PLAN_LIMITS[plan];
  if (limits.maxQuotesPerMonth === null) return { allowed: true };

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const countThisMonth = await db.quote.count({
    where: { businessId, createdAt: { gte: startOfMonth }, deletedAt: null },
  });

  if (countThisMonth >= limits.maxQuotesPerMonth) {
    return {
      allowed: false,
      reason: `Llegaste al límite de ${limits.maxQuotesPerMonth} presupuestos por mes del plan ${limits.label}. Mejorá tu plan para seguir creando presupuestos.`,
    };
  }
  return { allowed: true };
}

export async function canUseAi(businessId: string, db: DbClient = prisma): Promise<boolean> {
  const plan = await getBusinessPlan(businessId, db);
  return PLAN_LIMITS[plan].ai;
}
