import { describe, it, expect, afterAll } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { canCreateQuote, canUseAi, PLAN_LIMITS } from "@/lib/billing/entitlements";

const userIds: string[] = [];

async function makeBusinessWithPlan(tag: string, plan: "FREE" | "STARTER" | "PRO") {
  const passwordHash = await bcrypt.hash("password123", 4);
  const user = await prisma.user.create({
    data: { name: `Owner ${tag}`, email: `ent_${tag}_${Date.now()}@test.local`, passwordHash },
  });
  userIds.push(user.id);
  return prisma.business.create({
    data: {
      ownerId: user.id,
      name: `Business ${tag}`,
      currency: "ARS",
      subscription: { create: { plan } },
    },
  });
}

describe("plan entitlements", () => {
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("blocks quote creation once the FREE monthly limit is reached", async () => {
    const business = await makeBusinessWithPlan("free-limit", "FREE");
    const customer = await prisma.customer.create({
      data: { businessId: business.id, name: "Cliente" },
    });

    for (let i = 0; i < PLAN_LIMITS.FREE.maxQuotesPerMonth!; i++) {
      await prisma.quote.create({
        data: {
          businessId: business.id,
          customerId: customer.id,
          number: i + 1,
          publicToken: `ent_tok_${business.id}_${i}`,
          currency: "ARS",
          subtotal: 100,
          discount: 0,
          total: 100,
        },
      });
    }

    const result = await canCreateQuote(business.id);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/límite/i);
  });

  it("allows quote creation under the limit", async () => {
    const business = await makeBusinessWithPlan("free-ok", "FREE");
    const result = await canCreateQuote(business.id);
    expect(result.allowed).toBe(true);
  });

  it("PRO plan has no monthly quote limit", async () => {
    const business = await makeBusinessWithPlan("pro", "PRO");
    const customer = await prisma.customer.create({
      data: { businessId: business.id, name: "Cliente" },
    });
    // Create more quotes than the FREE limit to prove PRO isn't capped.
    for (let i = 0; i < PLAN_LIMITS.FREE.maxQuotesPerMonth! + 2; i++) {
      await prisma.quote.create({
        data: {
          businessId: business.id,
          customerId: customer.id,
          number: i + 1,
          publicToken: `pro_tok_${business.id}_${i}`,
          currency: "ARS",
          subtotal: 100,
          discount: 0,
          total: 100,
        },
      });
    }
    const result = await canCreateQuote(business.id);
    expect(result.allowed).toBe(true);
  });

  it("gates AI by plan", async () => {
    const free = await makeBusinessWithPlan("ai-free", "FREE");
    const starter = await makeBusinessWithPlan("ai-starter", "STARTER");
    expect(await canUseAi(free.id)).toBe(false);
    expect(await canUseAi(starter.id)).toBe(true);
  });
});
