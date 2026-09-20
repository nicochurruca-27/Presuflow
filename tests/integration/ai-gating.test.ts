import { describe, it, expect, afterAll, beforeEach, vi } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { Business, PlanId } from "@prisma/client";

/**
 * The AI actions are gated server-side, so hiding the button in the UI is
 * not what protects them. These tests call the real Server Actions with
 * only the session mocked — i.e. exactly what a FREE user could do by
 * invoking the action directly — and assert the plan gate still refuses.
 */
const session: { business: Business | null } = { business: null };

vi.mock("@/lib/auth-helpers", () => ({
  requireUser: async () => ({ id: "test-user" }),
  requireBusiness: async () => {
    if (!session.business) throw new Error("test session has no business");
    return { user: { id: session.business.ownerId }, business: session.business };
  },
  getSessionBusiness: async () =>
    session.business ? { user: { id: session.business.ownerId }, business: session.business } : null,
}));

const { draftQuoteWithAiAction, improveDescriptionAction, generateConditionsAction } = await import(
  "@/lib/actions/quotes"
);

const userIds: string[] = [];

async function makeBusiness(tag: string, plan: PlanId) {
  const passwordHash = await bcrypt.hash("password123", 4);
  const user = await prisma.user.create({
    data: {
      name: `Owner ${tag}`,
      email: `ai_${tag}_${Date.now()}_${Math.random()}@test.local`,
      passwordHash,
    },
  });
  userIds.push(user.id);
  return prisma.business.create({
    data: {
      ownerId: user.id,
      name: `Business ${tag}`,
      activity: "Electricista",
      currency: "ARS",
      subscription: { create: { plan } },
    },
  });
}

describe("AI is gated server-side by plan", () => {
  beforeEach(() => {
    session.business = null;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("refuses draftQuoteWithAiAction for a FREE business calling the action directly", async () => {
    session.business = await makeBusiness("free-draft", "FREE");

    const result = await draftQuoteWithAiAction("Instalación de aire, mano de obra 50 mil");

    expect(result.error).toMatch(/Starter/i);
    expect(result.items).toBeUndefined();
  });

  it("refuses improveDescriptionAction and generateConditionsAction for FREE", async () => {
    session.business = await makeBusiness("free-helpers", "FREE");

    expect((await improveDescriptionAction("cambio de llave")).error).toMatch(/Starter/i);
    expect((await generateConditionsAction()).error).toMatch(/Starter/i);
  });

  it("refuses a business whose paid subscription already lapsed", async () => {
    const passwordHash = await bcrypt.hash("password123", 4);
    const user = await prisma.user.create({
      data: { name: "Lapsed", email: `ai_lapsed_${Date.now()}@test.local`, passwordHash },
    });
    userIds.push(user.id);
    session.business = await prisma.business.create({
      data: {
        ownerId: user.id,
        name: "Lapsed PRO",
        currency: "ARS",
        subscription: {
          create: {
            plan: "PRO",
            status: "ACTIVE",
            currentPeriodEnd: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
      },
    });

    const result = await draftQuoteWithAiAction("cualquier cosa");
    expect(result.error).toMatch(/Starter/i);
  });

  it("lets a STARTER business past the plan gate (it then fails on the missing API key, not the plan)", async () => {
    session.business = await makeBusiness("starter-draft", "STARTER");

    const result = await draftQuoteWithAiAction("Instalación de aire, mano de obra 50 mil");

    // AI_API_KEY isn't set in the test env, so it gets past the gate and
    // stops at the provider — proving the refusal above was the plan check.
    expect(result.error).not.toMatch(/Starter/i);
    expect(result.error).toMatch(/IA no está configurada/i);
  });
});
