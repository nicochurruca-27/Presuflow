import { PlanId } from "@prisma/client";
import { prisma } from "@/lib/prisma";

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

export async function getBusinessPlan(businessId: string): Promise<PlanId> {
  const sub = await prisma.subscription.findUnique({ where: { businessId } });
  return sub?.plan ?? "FREE";
}

export async function canCreateQuote(businessId: string): Promise<{
  allowed: boolean;
  reason?: string;
}> {
  const plan = await getBusinessPlan(businessId);
  const limits = PLAN_LIMITS[plan];
  if (limits.maxQuotesPerMonth === null) return { allowed: true };

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const countThisMonth = await prisma.quote.count({
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

export async function canUseAi(businessId: string): Promise<boolean> {
  const plan = await getBusinessPlan(businessId);
  return PLAN_LIMITS[plan].ai;
}
