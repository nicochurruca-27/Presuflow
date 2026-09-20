import { PlanId, Prisma } from "@prisma/client";
import type { Subscription } from "@prisma/client";
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

/** Same idea as QuoteLimitReachedError, for the per-plan customer cap. */
export class CustomerLimitReachedError extends Error {
  constructor(message?: string) {
    super(message ?? "Llegaste al límite de clientes de tu plan.");
    this.name = "CustomerLimitReachedError";
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

type SubscriptionForEntitlements = Pick<
  Subscription,
  "plan" | "status" | "currentPeriodEnd"
>;

/**
 * Which plan a business actually gets the benefits of, right now.
 *
 * Billing is not implemented yet (no Stripe/Mercado Pago — see README), so
 * this is the policy that future webhooks will feed rather than replace:
 *
 * - No subscription row, or plan FREE → FREE. The paid-plan rules below
 *   never apply to FREE, whatever its status says.
 * - A paid plan only counts while the period it was paid for is still
 *   running. Once `currentPeriodEnd` is in the past the business falls back
 *   to FREE regardless of status — that's what stops a stale row from
 *   granting paid features forever.
 * - ACTIVE: the plan applies. A null `currentPeriodEnd` means "no expiry
 *   recorded" (today that's a plan set by hand, since nothing writes
 *   periods yet) and is treated as in good standing.
 * - CANCELLED: they keep what they already paid for until the period ends.
 *   With no known period end there is nothing to honour → FREE immediately.
 * - PAST_DUE: same grace window. In a real billing setup the provider
 *   retries the charge for a few days; downgrading on the first failed
 *   charge would lock someone out over an expired card. Past the paid
 *   period, it falls back to FREE like everything else.
 *
 * `cancelledAt` is deliberately not an input here: it records *when* a
 * cancellation happened for reporting, while `status` + `currentPeriodEnd`
 * are what decide access.
 */
export function effectivePlan(
  sub: SubscriptionForEntitlements | null,
  now: Date = new Date()
): PlanId {
  if (!sub) return "FREE";
  if (sub.plan === "FREE") return "FREE";

  const periodOver = sub.currentPeriodEnd !== null && sub.currentPeriodEnd.getTime() < now.getTime();
  if (periodOver) return "FREE";

  switch (sub.status) {
    case "ACTIVE":
      return sub.plan;
    case "CANCELLED":
    case "PAST_DUE":
      return sub.currentPeriodEnd ? sub.plan : "FREE";
    default:
      return "FREE";
  }
}

export async function getBusinessPlan(
  businessId: string,
  db: DbClient = prisma
): Promise<PlanId> {
  const sub = await db.subscription.findUnique({ where: { businessId } });
  return effectivePlan(sub);
}

/**
 * Which quotes consume the monthly quota: those created this calendar month
 * that haven't been soft-deleted (`deletedAt`). Two consequences worth being
 * explicit about, since both are deliberate and pinned by tests:
 *
 * - Cancelling a quote sets `deletedAt`, so it gives the slot back. A
 *   mistyped quote that gets cancelled shouldn't burn quota.
 * - ACCEPTED/REJECTED/EXPIRED quotes keep their slot: they represent real
 *   work that was sent to a customer.
 */
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

/**
 * The customer cap counts *active* customers only — archiving a customer
 * frees a slot. That matches what the app shows everywhere else (the
 * customer list and the quote form both filter on `archivedAt: null`), and
 * gives a FREE user a way to stay under the cap without losing history:
 * an archived customer keeps its quotes.
 */
export async function canCreateCustomer(
  businessId: string,
  db: DbClient = prisma
): Promise<{
  allowed: boolean;
  reason?: string;
}> {
  const plan = await getBusinessPlan(businessId, db);
  const limits = PLAN_LIMITS[plan];
  if (limits.maxCustomers === null) return { allowed: true };

  const activeCustomers = await db.customer.count({
    where: { businessId, archivedAt: null },
  });

  if (activeCustomers >= limits.maxCustomers) {
    return {
      allowed: false,
      reason: `Llegaste al límite de ${limits.maxCustomers} clientes del plan ${limits.label}. Archivá alguno que ya no uses o mejorá tu plan.`,
    };
  }
  return { allowed: true };
}

export async function canUseAi(businessId: string, db: DbClient = prisma): Promise<boolean> {
  const plan = await getBusinessPlan(businessId, db);
  return PLAN_LIMITS[plan].ai;
}

/**
 * Note on `customBranding`: it's declared per plan and shown on the pricing
 * page, but nothing enforces it yet because nothing *sets* a logo —
 * `Business.logoUrl` is only ever read (on the public quote page). When an
 * upload/branding flow is built, it must gate on this entitlement
 * server-side, the same way canUseAi() gates the AI actions.
 */
