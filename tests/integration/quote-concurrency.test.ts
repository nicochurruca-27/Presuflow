import { describe, it, expect, afterAll } from "vitest";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import {
  applyTransition,
  performAcceptQuote,
  performRejectQuote,
  performCreateQuote,
  performMarkQuoteSent,
} from "@/lib/quote-lifecycle";
import { recordQuoteView } from "@/lib/track-quote-view";
import { QuoteLimitReachedError, PLAN_LIMITS } from "@/lib/billing/entitlements";
import type { PlanId, QuoteStatus } from "@prisma/client";

const userIds: string[] = [];

async function makeBusiness(tag: string, plan: PlanId = "PRO") {
  const passwordHash = await bcrypt.hash("password123", 4);
  const user = await prisma.user.create({
    data: {
      name: `Owner ${tag}`,
      email: `concurrency_${tag}_${Date.now()}_${Math.random()}@test.local`,
      passwordHash,
    },
  });
  userIds.push(user.id);
  const business = await prisma.business.create({
    data: {
      ownerId: user.id,
      name: `Business ${tag}`,
      currency: "ARS",
      subscription: { create: { plan } },
    },
  });
  const customer = await prisma.customer.create({
    data: { businessId: business.id, name: "Cliente" },
  });
  return { business, customer };
}

async function makeQuote(
  businessId: string,
  customerId: string,
  status: QuoteStatus = "SENT"
) {
  return prisma.quote.create({
    data: {
      businessId,
      customerId,
      number: Math.floor(Math.random() * 1_000_000_000),
      publicToken: nanoid(32),
      status,
      currency: "ARS",
      subtotal: 1000,
      discount: 0,
      total: 1000,
      sentAt: new Date(),
    },
  });
}

function countEvents(quoteId: string, type: string) {
  return prisma.quoteEvent.count({ where: { quoteId, type: type as never } });
}

function countProductEvents(businessId: string, name: string) {
  return prisma.productEvent.count({ where: { businessId, name } });
}

describe("concurrent quote transitions", () => {
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("two simultaneous accepts produce one transition, one event and one notification", async () => {
    const { business, customer } = await makeBusiness("accept-accept");
    const quote = await makeQuote(business.id, customer.id, "SENT");

    const results = await Promise.all([
      performAcceptQuote(quote.publicToken),
      performAcceptQuote(quote.publicToken),
      performAcceptQuote(quote.publicToken),
    ]);

    // Every caller sees the same, consistent outcome...
    expect(results).toEqual(["ACCEPTED", "ACCEPTED", "ACCEPTED"]);

    // ...but the transition itself only happened once.
    expect(await countEvents(quote.id, "ACCEPTED")).toBe(1);
    // track()/sendEmail() run in the same branch as the winning transition,
    // so exactly one analytics row means exactly one email was sent.
    expect(await countProductEvents(business.id, "quote_accepted")).toBe(1);

    const fromDb = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
    expect(fromDb.status).toBe("ACCEPTED");
  });

  it("two simultaneous rejects produce one transition and one event", async () => {
    const { business, customer } = await makeBusiness("reject-reject");
    const quote = await makeQuote(business.id, customer.id, "VIEWED");

    const results = await Promise.all([
      performRejectQuote(quote.publicToken),
      performRejectQuote(quote.publicToken),
      performRejectQuote(quote.publicToken),
    ]);

    expect(results).toEqual(["REJECTED", "REJECTED", "REJECTED"]);
    expect(await countEvents(quote.id, "REJECTED")).toBe(1);
    expect(await countProductEvents(business.id, "quote_rejected")).toBe(1);
  });

  it("a simultaneous accept and reject cannot both win", async () => {
    const { business, customer } = await makeBusiness("accept-reject");
    const quote = await makeQuote(business.id, customer.id, "SENT");

    await Promise.all([
      performAcceptQuote(quote.publicToken),
      performRejectQuote(quote.publicToken),
    ]);

    const fromDb = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
    expect(["ACCEPTED", "REJECTED"]).toContain(fromDb.status);

    const accepted = await countEvents(quote.id, "ACCEPTED");
    const rejected = await countEvents(quote.id, "REJECTED");
    // Exactly one of the two transitions happened — never both.
    expect(accepted + rejected).toBe(1);

    if (fromDb.status === "ACCEPTED") {
      expect(fromDb.acceptedAt).not.toBeNull();
      expect(fromDb.rejectedAt).toBeNull();
    } else {
      expect(fromDb.rejectedAt).not.toBeNull();
      expect(fromDb.acceptedAt).toBeNull();
    }
  });

  it("simultaneous page loads log every view but transition SENT -> VIEWED only once", async () => {
    const { business, customer } = await makeBusiness("sent-viewed");
    const quote = await makeQuote(business.id, customer.id, "SENT");

    await Promise.all([
      recordQuoteView(quote, "agent-1"),
      recordQuoteView(quote, "agent-2"),
      recordQuoteView(quote, "agent-3"),
    ]);

    // Each page load is a real view and is kept.
    expect(await prisma.quoteView.count({ where: { quoteId: quote.id } })).toBe(3);
    // The status change is not.
    expect(await countEvents(quote.id, "VIEWED")).toBe(1);
    expect(await countProductEvents(business.id, "quote_viewed")).toBe(1);

    const fromDb = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
    expect(fromDb.status).toBe("VIEWED");
  });

  it("two simultaneous sends mark the quote sent once", async () => {
    const { business, customer } = await makeBusiness("draft-sent");
    const quote = await makeQuote(business.id, customer.id, "DRAFT");

    await Promise.all([
      performMarkQuoteSent(business.id, quote.id),
      performMarkQuoteSent(business.id, quote.id),
    ]);

    expect(await countEvents(quote.id, "SENT")).toBe(1);
    expect(await countProductEvents(business.id, "quote_sent")).toBe(1);
  });

  it("refuses a transition that the state machine doesn't allow, even called directly", async () => {
    const { business, customer } = await makeBusiness("invalid-transition");
    const quote = await makeQuote(business.id, customer.id, "CANCELLED");

    const result = await applyTransition(quote.id, "ACCEPTED", { eventType: "ACCEPTED" });

    expect(result.changed).toBe(false);
    expect(result.status).toBe("CANCELLED");
    expect(await countEvents(quote.id, "ACCEPTED")).toBe(0);
  });

  it("keeps the tenant scope atomic: another business cannot transition the quote", async () => {
    const owner = await makeBusiness("scope-owner");
    const intruder = await makeBusiness("scope-intruder");
    const quote = await makeQuote(owner.business.id, owner.customer.id, "DRAFT");

    const result = await applyTransition(quote.id, "SENT", {
      eventType: "SENT",
      businessId: intruder.business.id,
    });

    expect(result.changed).toBe(false);
    expect(result.status).toBeNull();
    const fromDb = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
    expect(fromDb.status).toBe("DRAFT");
  });
});

describe("concurrent quote creation against the monthly limit", () => {
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("cannot exceed the FREE monthly limit with simultaneous requests", async () => {
    const limit = PLAN_LIMITS.FREE.maxQuotesPerMonth!;
    const { business, customer } = await makeBusiness("limit-race", "FREE");

    // Fill the month up to one slot short of the limit.
    for (let i = 0; i < limit - 1; i++) {
      await makeQuote(business.id, customer.id, "DRAFT");
    }

    const input = {
      customerId: customer.id,
      items: [{ description: "Trabajo", quantity: 1, unitPrice: 1000, detail: "" }],
      discount: 0,
    };

    // Three requests race for the single remaining slot.
    const outcomes = await Promise.allSettled([
      performCreateQuote(business, input, nanoid(32)),
      performCreateQuote(business, input, nanoid(32)),
      performCreateQuote(business, input, nanoid(32)),
    ]);

    const fulfilled = outcomes.filter((o) => o.status === "fulfilled");
    const rejected = outcomes.filter((o) => o.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(2);
    for (const outcome of rejected) {
      expect((outcome as PromiseRejectedResult).reason).toBeInstanceOf(QuoteLimitReachedError);
    }

    const total = await prisma.quote.count({ where: { businessId: business.id, deletedAt: null } });
    expect(total).toBe(limit);

    // The rejected transactions rolled back, so they didn't burn quote numbers either.
    const fresh = await prisma.business.findUniqueOrThrow({ where: { id: business.id } });
    expect(fresh.quoteCounter).toBe(1);
  });

  it("still allows concurrent creation when the plan has room", async () => {
    const { business, customer } = await makeBusiness("limit-room", "PRO");

    const input = {
      customerId: customer.id,
      items: [{ description: "Trabajo", quantity: 1, unitPrice: 1000, detail: "" }],
      discount: 0,
    };

    const created = await Promise.all([
      performCreateQuote(business, input, nanoid(32)),
      performCreateQuote(business, input, nanoid(32)),
      performCreateQuote(business, input, nanoid(32)),
    ]);

    expect(created).toHaveLength(3);
    // Sequential numbering survived the concurrency — no duplicates.
    const numbers = created.map((q) => q.number).sort((a, b) => a - b);
    expect(numbers).toEqual([1, 2, 3]);
  });
});
