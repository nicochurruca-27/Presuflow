import { describe, it, expect, afterAll, beforeEach, vi } from "vitest";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import type { QuoteStatus } from "@prisma/client";

/**
 * A critical operation must never be undone — or made to *look* failed — by
 * a secondary one. These tests force the secondary steps (transactional
 * email, product analytics) to throw and assert the primary write survives.
 *
 * Note the mocks replace sendEmail/track entirely, so their own internal
 * try/catch doesn't apply: this is deliberately testing that the *caller*
 * is safe even when the callee misbehaves, rather than trusting it to.
 */
const emailFailure = { shouldThrow: false, calls: 0 };
const trackFailure = { shouldThrow: false, calls: 0 };

vi.mock("@/lib/email/send", () => ({
  sendEmail: async () => {
    emailFailure.calls++;
    if (emailFailure.shouldThrow) throw new Error("Resend is down");
    return { delivered: true };
  },
}));

vi.mock("@/lib/analytics", () => ({
  track: async () => {
    trackFailure.calls++;
    if (trackFailure.shouldThrow) throw new Error("analytics exploded");
  },
}));

vi.mock("@/auth", () => ({
  signIn: async () => undefined,
  signOut: async () => undefined,
  auth: async () => null,
}));

// next-auth's entrypoint pulls in next/server, which doesn't resolve outside
// the Next bundler. Only AuthError is used here (for an instanceof check).
vi.mock("next-auth", () => ({
  AuthError: class AuthError extends Error {},
}));

class RedirectSignal extends Error {
  constructor(public url: string) {
    super(`REDIRECT:${url}`);
  }
}

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

const { performAcceptQuote, performRejectQuote } = await import("@/lib/quote-lifecycle");
const { signupAction } = await import("@/lib/actions/auth");

const userIds: string[] = [];

async function makeQuote(tag: string, status: QuoteStatus = "SENT") {
  const passwordHash = await bcrypt.hash("password123", 4);
  const user = await prisma.user.create({
    data: {
      name: `Owner ${tag}`,
      email: `rel_${tag}_${Date.now()}_${Math.random()}@test.local`,
      passwordHash,
    },
  });
  userIds.push(user.id);
  const business = await prisma.business.create({
    data: { ownerId: user.id, name: `Business ${tag}`, currency: "ARS" },
  });
  const customer = await prisma.customer.create({
    data: { businessId: business.id, name: "Cliente" },
  });
  const quote = await prisma.quote.create({
    data: {
      businessId: business.id,
      customerId: customer.id,
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
  return { business, customer, quote };
}

describe("a failing secondary step never breaks the critical operation", () => {
  beforeEach(() => {
    emailFailure.shouldThrow = false;
    emailFailure.calls = 0;
    trackFailure.shouldThrow = false;
    trackFailure.calls = 0;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("accepts the quote even if the notification email blows up", async () => {
    const { quote } = await makeQuote("accept-email-down");
    emailFailure.shouldThrow = true;

    const status = await performAcceptQuote(quote.publicToken);

    expect(status).toBe("ACCEPTED");
    const fromDb = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
    expect(fromDb.status).toBe("ACCEPTED");
    expect(fromDb.acceptedAt).not.toBeNull();
    // The lifecycle event is part of the critical transition, so it survives too.
    expect(
      await prisma.quoteEvent.count({ where: { quoteId: quote.id, type: "ACCEPTED" } })
    ).toBe(1);
  });

  it("accepts the quote even if analytics blows up", async () => {
    const { quote } = await makeQuote("accept-track-down");
    trackFailure.shouldThrow = true;

    const status = await performAcceptQuote(quote.publicToken);

    expect(status).toBe("ACCEPTED");
    const fromDb = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
    expect(fromDb.status).toBe("ACCEPTED");
  });

  it("accepts the quote even if analytics and email both blow up", async () => {
    const { quote } = await makeQuote("accept-both-down");
    trackFailure.shouldThrow = true;
    emailFailure.shouldThrow = true;

    const status = await performAcceptQuote(quote.publicToken);

    expect(status).toBe("ACCEPTED");
    const fromDb = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
    expect(fromDb.status).toBe("ACCEPTED");
  });

  it("rejects the quote even if analytics blows up", async () => {
    const { quote } = await makeQuote("reject-track-down", "VIEWED");
    trackFailure.shouldThrow = true;

    const status = await performRejectQuote(quote.publicToken);

    expect(status).toBe("REJECTED");
    const fromDb = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
    expect(fromDb.status).toBe("REJECTED");
    expect(fromDb.rejectedAt).not.toBeNull();
  });

  it("creates the user even if the welcome email blows up", async () => {
    emailFailure.shouldThrow = true;
    const email = `signup_fail_${Date.now()}@test.local`;

    const formData = new FormData();
    formData.set("name", "Nuevo Usuario");
    formData.set("email", email);
    formData.set("password", "password123");

    // A successful signup ends in redirect(), which throws by design.
    await expect(signupAction(undefined, formData)).rejects.toBeInstanceOf(RedirectSignal);

    const user = await prisma.user.findUnique({ where: { email } });
    expect(user).not.toBeNull();
    userIds.push(user!.id);
  });

  it("does not duplicate the user when signup runs twice", async () => {
    const email = `signup_dup_${Date.now()}@test.local`;
    const formData = () => {
      const fd = new FormData();
      fd.set("name", "Duplicado");
      fd.set("email", email);
      fd.set("password", "password123");
      return fd;
    };

    await expect(signupAction(undefined, formData())).rejects.toBeInstanceOf(RedirectSignal);
    const second = await signupAction(undefined, formData());

    // The second attempt returns a friendly error instead of creating a twin.
    expect(second?.error).toMatch(/Ya existe una cuenta/i);
    expect(await prisma.user.count({ where: { email } })).toBe(1);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    userIds.push(user.id);
  });

  it("the request that loses the race fires no email and no analytics of its own", async () => {
    const { quote } = await makeQuote("race-side-effects");

    const results = await Promise.all([
      performAcceptQuote(quote.publicToken),
      performAcceptQuote(quote.publicToken),
      performAcceptQuote(quote.publicToken),
    ]);

    expect(results).toEqual(["ACCEPTED", "ACCEPTED", "ACCEPTED"]);
    // Three callers, one winner: one email and one analytics event in total.
    expect(emailFailure.calls).toBe(1);
    expect(trackFailure.calls).toBe(1);
    expect(
      await prisma.quoteEvent.count({ where: { quoteId: quote.id, type: "ACCEPTED" } })
    ).toBe(1);
  });
});
