import { describe, it, expect, afterAll, beforeEach, vi } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { Business, PlanId } from "@prisma/client";
import { RATE_LIMITS } from "@/lib/rate-limit";

/**
 * The usage ceiling on AI, as opposed to the plan gate (which lives in
 * ai-gating.test.ts). Every call to the provider costs money and a Server
 * Action can be invoked in a loop, so all four operations have to consume
 * the same per-business allowance.
 *
 * The provider is replaced by a counter here rather than left unconfigured:
 * "the limit blocked it" and "there was no API key" both end in no request,
 * so only counting the calls distinguishes them.
 */
let providerCalls = 0;

vi.mock("@/lib/ai", () => ({
  aiProvider: {
    generateFollowUpMessage: async () => {
      providerCalls++;
      return "Hola Ana, ¿pudiste ver el presupuesto? Quedo atento.";
    },
    draftQuoteFromText: async () => {
      providerCalls++;
      return { items: [], missingInfo: [] };
    },
    improveDescription: async () => {
      providerCalls++;
      return "texto mejorado";
    },
    generateConditions: async () => {
      providerCalls++;
      return "condiciones generadas";
    },
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const session: { business: Business | null } = { business: null };

vi.mock("@/lib/auth-helpers", () => ({
  requireUser: async () => ({ id: session.business?.ownerId ?? "test-user" }),
  requireBusiness: async () => {
    if (!session.business) throw new Error("test session has no business");
    return { user: { id: session.business.ownerId }, business: session.business };
  },
  getSessionBusiness: async () =>
    session.business ? { user: { id: session.business.ownerId }, business: session.business } : null,
}));

const { generateFollowUpMessageAction, improveDescriptionAction } = await import(
  "@/lib/actions/quotes"
);

const userIds: string[] = [];
const rateLimitKeys: string[] = [];

async function makeBusiness(tag: string, plan: PlanId = "STARTER") {
  const user = await prisma.user.create({
    data: {
      name: `Owner ${tag}`,
      email: `ailimit_${tag}_${Date.now()}_${Math.random()}@test.local`,
      passwordHash: await bcrypt.hash("password123", 4),
    },
  });
  userIds.push(user.id);
  const business = await prisma.business.create({
    data: {
      ownerId: user.id,
      name: `Business ${tag}`,
      activity: "Electricista",
      currency: "ARS",
      subscription: { create: { plan } },
    },
  });
  rateLimitKeys.push(`ai-hour:${business.id}`, `ai-day:${business.id}`);
  return business;
}

/** A quote the follow-up action will actually work on: sent, still open. */
async function makeSentQuote(businessId: string) {
  const customer = await prisma.customer.create({
    data: { businessId, name: "Ana Gómez" },
  });
  return prisma.quote.create({
    data: {
      businessId,
      customerId: customer.id,
      number: Math.floor(Math.random() * 1_000_000),
      publicToken: `ailimit_${Date.now()}_${Math.random()}`,
      currency: "ARS",
      subtotal: 1000,
      total: 1000,
      status: "SENT",
      sentAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    },
  });
}

/**
 * Pre-fills a window to its limit instead of calling the action hundreds of
 * times. The window start is recomputed from RATE_LIMITS the same way the
 * limiter does it, so if a limit or a window length changes, this follows.
 */
async function exhaust(key: string, rule: { limit: number; windowMs: number }) {
  const windowStart = new Date(Math.floor(Date.now() / rule.windowMs) * rule.windowMs);
  await prisma.rateLimitWindow.upsert({
    where: { key_windowStart: { key, windowStart } },
    create: { key, windowStart, count: rule.limit },
    update: { count: rule.limit },
  });
}

beforeEach(() => {
  providerCalls = 0;
  session.business = null;
});

afterAll(async () => {
  session.business = null;
  await prisma.rateLimitWindow.deleteMany({ where: { key: { in: rateLimitKeys } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("the follow-up message respects the AI usage ceiling", () => {
  it("uses the AI while there is allowance left", async () => {
    const business = await makeBusiness("followup-ok");
    session.business = business;
    const quote = await makeSentQuote(business.id);

    const result = await generateFollowUpMessageAction(quote.id);

    expect(providerCalls).toBe(1);
    expect(result.aiGenerated).toBe(true);
    expect(result.message).toMatch(/pudiste ver el presupuesto/i);
  });

  it("stops calling the provider once the hourly limit is spent", async () => {
    const business = await makeBusiness("followup-hour");
    session.business = business;
    const quote = await makeSentQuote(business.id);

    await exhaust(`ai-hour:${business.id}`, RATE_LIMITS.aiPerHour);

    const result = await generateFollowUpMessageAction(quote.id);

    // The point of the limit: no request leaves the process.
    expect(providerCalls).toBe(0);
    // …and the user still gets a message, because this action has a template.
    expect(result.aiGenerated).toBe(false);
    expect(result.message).not.toBe("");
  });

  it("stops calling the provider once the daily ceiling is spent", async () => {
    const business = await makeBusiness("followup-day");
    session.business = business;
    const quote = await makeSentQuote(business.id);

    // Only the daily window is full; the hourly one has room.
    await exhaust(`ai-day:${business.id}`, RATE_LIMITS.aiPerDay);

    const result = await generateFollowUpMessageAction(quote.id);

    expect(providerCalls).toBe(0);
    expect(result.aiGenerated).toBe(false);
    expect(result.message).not.toBe("");
  });

  it("counts every attempt, so the allowance really runs out", async () => {
    const business = await makeBusiness("followup-counts");
    session.business = business;
    const quote = await makeSentQuote(business.id);

    // One below the hourly limit, then two calls: the first is allowed, the
    // second is not. This is what proves the action consumes the counter
    // rather than merely reading it.
    await prisma.rateLimitWindow.create({
      data: {
        key: `ai-hour:${business.id}`,
        windowStart: new Date(
          Math.floor(Date.now() / RATE_LIMITS.aiPerHour.windowMs) *
            RATE_LIMITS.aiPerHour.windowMs
        ),
        count: RATE_LIMITS.aiPerHour.limit - 1,
      },
    });

    expect((await generateFollowUpMessageAction(quote.id)).aiGenerated).toBe(true);
    expect((await generateFollowUpMessageAction(quote.id)).aiGenerated).toBe(false);
    expect(providerCalls).toBe(1);
  });

  it("shares one allowance with the other AI operations", async () => {
    const business = await makeBusiness("followup-shared");
    session.business = business;
    const quote = await makeSentQuote(business.id);

    // Spent by whatever operation — the ceiling is per business, not per feature.
    await exhaust(`ai-hour:${business.id}`, RATE_LIMITS.aiPerHour);

    expect((await generateFollowUpMessageAction(quote.id)).aiGenerated).toBe(false);
    expect((await improveDescriptionAction("cambio de llave")).error).toMatch(/máximo de usos/i);
    expect(providerCalls).toBe(0);
  });

  it("still refuses a FREE business before spending any allowance", async () => {
    const business = await makeBusiness("followup-free", "FREE");
    session.business = business;
    const quote = await makeSentQuote(business.id);

    const result = await generateFollowUpMessageAction(quote.id);

    expect(providerCalls).toBe(0);
    expect(result.aiGenerated).toBe(false);
    expect(result.message).not.toBe("");
    // The plan gate runs first, so a FREE business never burns a slot of a
    // quota it can't use anyway.
    const windows = await prisma.rateLimitWindow.findMany({
      where: { key: { in: [`ai-hour:${business.id}`, `ai-day:${business.id}`] } },
    });
    expect(windows).toHaveLength(0);
  });

  it("keeps STARTER and PRO working within the limit", async () => {
    for (const plan of ["STARTER", "PRO"] as PlanId[]) {
      providerCalls = 0;
      const business = await makeBusiness(`followup-${plan}`, plan);
      session.business = business;
      const quote = await makeSentQuote(business.id);

      const result = await generateFollowUpMessageAction(quote.id);

      expect(result.aiGenerated, `${plan} debería poder usar la IA`).toBe(true);
      expect(providerCalls).toBe(1);
    }
  });
});
