import { describe, it, expect, afterAll } from "vitest";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import {
  canCreateCustomer,
  canCreateQuote,
  canUseAi,
  getBusinessPlan,
  CustomerLimitReachedError,
  PLAN_LIMITS,
} from "@/lib/billing/entitlements";
import { performCreateCustomer } from "@/lib/customer-service";
import type { PlanId, SubscriptionStatus } from "@prisma/client";

const userIds: string[] = [];
const FREE_CUSTOMER_LIMIT = PLAN_LIMITS.FREE.maxCustomers!;

async function makeBusiness(
  tag: string,
  plan: PlanId = "FREE",
  subscription: { status?: SubscriptionStatus; currentPeriodEnd?: Date | null } = {}
) {
  const passwordHash = await bcrypt.hash("password123", 4);
  const user = await prisma.user.create({
    data: {
      name: `Owner ${tag}`,
      email: `cust_${tag}_${Date.now()}_${Math.random()}@test.local`,
      passwordHash,
    },
  });
  userIds.push(user.id);
  return prisma.business.create({
    data: {
      ownerId: user.id,
      name: `Business ${tag}`,
      currency: "ARS",
      subscription: {
        create: {
          plan,
          status: subscription.status ?? "ACTIVE",
          currentPeriodEnd: subscription.currentPeriodEnd ?? null,
        },
      },
    },
  });
}

async function addCustomers(businessId: string, count: number, archived = false) {
  for (let i = 0; i < count; i++) {
    await prisma.customer.create({
      data: {
        businessId,
        name: `Cliente ${i}`,
        archivedAt: archived ? new Date() : null,
      },
    });
  }
}

const customerInput = { name: "Cliente nuevo", phone: "", email: "", address: "", notes: "" };

describe("FREE customer limit", () => {
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("allows creating a customer when one slot below the limit", async () => {
    const business = await makeBusiness("free-14", "FREE");
    await addCustomers(business.id, FREE_CUSTOMER_LIMIT - 1);

    expect((await canCreateCustomer(business.id)).allowed).toBe(true);

    const created = await performCreateCustomer(business.id, customerInput);
    expect(created.id).toBeTruthy();
  });

  it("blocks customer number 16 once FREE is full", async () => {
    const business = await makeBusiness("free-15", "FREE");
    await addCustomers(business.id, FREE_CUSTOMER_LIMIT);

    const check = await canCreateCustomer(business.id);
    expect(check.allowed).toBe(false);
    expect(check.reason).toMatch(/límite/i);

    await expect(performCreateCustomer(business.id, customerInput)).rejects.toBeInstanceOf(
      CustomerLimitReachedError
    );

    // Nothing was written.
    const total = await prisma.customer.count({ where: { businessId: business.id } });
    expect(total).toBe(FREE_CUSTOMER_LIMIT);
  });

  it("does not count archived customers toward the cap", async () => {
    const business = await makeBusiness("free-archived", "FREE");
    await addCustomers(business.id, FREE_CUSTOMER_LIMIT, true); // all archived
    await addCustomers(business.id, 2); // two active

    expect((await canCreateCustomer(business.id)).allowed).toBe(true);
    const created = await performCreateCustomer(business.id, customerInput);
    expect(created.id).toBeTruthy();
  });

  it("archiving a customer frees a slot on a full FREE plan", async () => {
    const business = await makeBusiness("free-archive-frees", "FREE");
    await addCustomers(business.id, FREE_CUSTOMER_LIMIT);
    expect((await canCreateCustomer(business.id)).allowed).toBe(false);

    const victim = await prisma.customer.findFirstOrThrow({ where: { businessId: business.id } });
    await prisma.customer.update({ where: { id: victim.id }, data: { archivedAt: new Date() } });

    expect((await canCreateCustomer(business.id)).allowed).toBe(true);
  });

  it.each(["STARTER", "PRO"] as PlanId[])("lets %s create customers without a cap", async (plan) => {
    const business = await makeBusiness(`unlimited-${plan}`, plan);
    await addCustomers(business.id, FREE_CUSTOMER_LIMIT + 5);

    expect((await canCreateCustomer(business.id)).allowed).toBe(true);
    const created = await performCreateCustomer(business.id, customerInput);
    expect(created.id).toBeTruthy();
  });

  it("counts each tenant's customers separately", async () => {
    const businessA = await makeBusiness("tenant-a", "FREE");
    const businessB = await makeBusiness("tenant-b", "FREE");
    await addCustomers(businessA.id, FREE_CUSTOMER_LIMIT);

    expect((await canCreateCustomer(businessA.id)).allowed).toBe(false);
    // B's cap is untouched by A being full.
    expect((await canCreateCustomer(businessB.id)).allowed).toBe(true);

    const created = await performCreateCustomer(businessB.id, customerInput);
    expect(created.businessId).toBe(businessB.id);
  });
});

describe("subscription state drives entitlements end to end", () => {
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("an ACTIVE paid subscription grants its plan", async () => {
    const business = await makeBusiness("sub-active", "STARTER", {
      status: "ACTIVE",
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    expect(await getBusinessPlan(business.id)).toBe("STARTER");
    expect(await canUseAi(business.id)).toBe(true);
    expect((await canCreateCustomer(business.id)).allowed).toBe(true);
  });

  it("a CANCELLED subscription keeps access until the period ends, then falls back", async () => {
    const stillPaid = await makeBusiness("sub-cancelled-current", "PRO", {
      status: "CANCELLED",
      currentPeriodEnd: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    });
    expect(await getBusinessPlan(stillPaid.id)).toBe("PRO");

    const lapsed = await makeBusiness("sub-cancelled-past", "PRO", {
      status: "CANCELLED",
      currentPeriodEnd: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });
    expect(await getBusinessPlan(lapsed.id)).toBe("FREE");
    expect(await canUseAi(lapsed.id)).toBe(false);
  });

  it("a PAST_DUE subscription keeps the grace window but not forever", async () => {
    const inGrace = await makeBusiness("sub-pastdue-grace", "STARTER", {
      status: "PAST_DUE",
      currentPeriodEnd: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    });
    expect(await getBusinessPlan(inGrace.id)).toBe("STARTER");

    const lapsed = await makeBusiness("sub-pastdue-lapsed", "STARTER", {
      status: "PAST_DUE",
      currentPeriodEnd: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });
    expect(await getBusinessPlan(lapsed.id)).toBe("FREE");
  });

  it("an expired paid plan gets FREE's limits back, not the paid ones", async () => {
    const business = await makeBusiness("sub-expired-limits", "PRO", {
      status: "ACTIVE",
      currentPeriodEnd: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });
    await addCustomers(business.id, FREE_CUSTOMER_LIMIT);

    // PRO has no customer cap, but the subscription lapsed, so FREE's cap applies.
    expect(await getBusinessPlan(business.id)).toBe("FREE");
    expect((await canCreateCustomer(business.id)).allowed).toBe(false);
    expect(await canUseAi(business.id)).toBe(false);
  });

  it("falls back to FREE when a business has no subscription row", async () => {
    const passwordHash = await bcrypt.hash("password123", 4);
    const user = await prisma.user.create({
      data: { name: "No sub", email: `nosub_${Date.now()}@test.local`, passwordHash },
    });
    userIds.push(user.id);
    const business = await prisma.business.create({
      data: { ownerId: user.id, name: "Sin suscripción", currency: "ARS" },
    });

    expect(await getBusinessPlan(business.id)).toBe("FREE");
    expect(await canUseAi(business.id)).toBe(false);
  });
});

describe("what consumes the monthly quote quota", () => {
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  async function addQuote(
    businessId: string,
    customerId: string,
    data: { status?: "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED"; deletedAt?: Date | null } = {}
  ) {
    return prisma.quote.create({
      data: {
        businessId,
        customerId,
        number: Math.floor(Math.random() * 1_000_000_000),
        publicToken: nanoid(32),
        status: data.status ?? "SENT",
        currency: "ARS",
        subtotal: 1000,
        discount: 0,
        total: 1000,
        deletedAt: data.deletedAt ?? null,
      },
    });
  }

  it("counts accepted, rejected and expired quotes — they were real work", async () => {
    const business = await makeBusiness("quota-final-states", "FREE");
    const customer = await prisma.customer.create({
      data: { businessId: business.id, name: "C" },
    });

    await addQuote(business.id, customer.id, { status: "ACCEPTED" });
    await addQuote(business.id, customer.id, { status: "REJECTED" });
    await addQuote(business.id, customer.id, { status: "EXPIRED" });
    await addQuote(business.id, customer.id, { status: "SENT" });
    await addQuote(business.id, customer.id, { status: "SENT" });

    expect((await canCreateQuote(business.id)).allowed).toBe(false);
  });

  it("gives the slot back when a quote is cancelled (soft-deleted)", async () => {
    const business = await makeBusiness("quota-cancelled", "FREE");
    const customer = await prisma.customer.create({
      data: { businessId: business.id, name: "C" },
    });

    for (let i = 0; i < PLAN_LIMITS.FREE.maxQuotesPerMonth!; i++) {
      await addQuote(business.id, customer.id);
    }
    expect((await canCreateQuote(business.id)).allowed).toBe(false);

    // cancelQuoteAction sets deletedAt alongside cancelledAt.
    const victim = await prisma.quote.findFirstOrThrow({ where: { businessId: business.id } });
    await prisma.quote.update({
      where: { id: victim.id },
      data: { status: "CANCELLED", cancelledAt: new Date(), deletedAt: new Date() },
    });

    expect((await canCreateQuote(business.id)).allowed).toBe(true);
  });
});
