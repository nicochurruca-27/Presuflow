import { describe, it, expect, afterAll } from "vitest";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import {
  settleExpiration,
  performAcceptQuote,
  performRejectQuote,
  performCancelQuote,
  performRecordFollowUp,
} from "@/lib/quote-lifecycle";
import type { QuoteStatus } from "@prisma/client";

const userIds: string[] = [];

async function makeBusiness(tag: string) {
  const passwordHash = await bcrypt.hash("password123", 4);
  const user = await prisma.user.create({
    data: { name: `Owner ${tag}`, email: `lifecycle_${tag}_${Date.now()}@test.local`, passwordHash },
  });
  userIds.push(user.id);
  return prisma.business.create({
    data: { ownerId: user.id, name: `Business ${tag}`, currency: "ARS" },
  });
}

async function makeQuote(
  businessId: string,
  customerId: string,
  opts: { status?: QuoteStatus; validUntil?: Date | null; sentAt?: Date | null } = {}
) {
  return prisma.quote.create({
    data: {
      businessId,
      customerId,
      number: Math.floor(Math.random() * 1_000_000),
      publicToken: nanoid(32),
      status: opts.status ?? "SENT",
      currency: "ARS",
      subtotal: 1000,
      discount: 0,
      total: 1000,
      validUntil: opts.validUntil ?? null,
      sentAt: opts.sentAt ?? new Date(),
    },
  });
}

function daysFromNow(n: number) {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
}

describe("quote lifecycle", () => {
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  describe("settleExpiration", () => {
    it("flips an overdue SENT quote to EXPIRED and logs the event", async () => {
      const business = await makeBusiness("expire-sent");
      const customer = await prisma.customer.create({ data: { businessId: business.id, name: "C" } });
      const quote = await makeQuote(business.id, customer.id, {
        status: "SENT",
        validUntil: daysFromNow(-1),
      });

      const status = await settleExpiration(quote);
      expect(status).toBe("EXPIRED");

      const fromDb = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
      expect(fromDb.status).toBe("EXPIRED");

      const events = await prisma.quoteEvent.findMany({ where: { quoteId: quote.id } });
      expect(events.some((e) => e.type === "EXPIRED")).toBe(true);
    });

    it("leaves a quote alone if validUntil hasn't passed yet", async () => {
      const business = await makeBusiness("not-due");
      const customer = await prisma.customer.create({ data: { businessId: business.id, name: "C" } });
      const quote = await makeQuote(business.id, customer.id, {
        status: "VIEWED",
        validUntil: daysFromNow(5),
      });

      expect(await settleExpiration(quote)).toBe("VIEWED");
    });

    it("never moves a quote that's already finalized, even if overdue", async () => {
      const business = await makeBusiness("already-final");
      const customer = await prisma.customer.create({ data: { businessId: business.id, name: "C" } });
      const quote = await makeQuote(business.id, customer.id, {
        status: "ACCEPTED",
        validUntil: daysFromNow(-30),
      });

      expect(await settleExpiration(quote)).toBe("ACCEPTED");
      const fromDb = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
      expect(fromDb.status).toBe("ACCEPTED");
    });
  });

  describe("performAcceptQuote / performRejectQuote", () => {
    it("accepts an open quote that's still within its validity window", async () => {
      const business = await makeBusiness("accept-ok");
      const customer = await prisma.customer.create({ data: { businessId: business.id, name: "C" } });
      const quote = await makeQuote(business.id, customer.id, { status: "SENT", validUntil: daysFromNow(5) });

      const status = await performAcceptQuote(quote.publicToken);
      expect(status).toBe("ACCEPTED");
      const fromDb = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
      expect(fromDb.status).toBe("ACCEPTED");
      expect(fromDb.acceptedAt).not.toBeNull();
    });

    it("refuses to accept a quote already marked EXPIRED", async () => {
      const business = await makeBusiness("accept-expired");
      const customer = await prisma.customer.create({ data: { businessId: business.id, name: "C" } });
      const quote = await makeQuote(business.id, customer.id, { status: "EXPIRED" });

      const status = await performAcceptQuote(quote.publicToken);
      expect(status).toBe("EXPIRED");
      const fromDb = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
      expect(fromDb.status).toBe("EXPIRED");
    });

    it("refuses to accept a SENT quote whose validUntil already passed", async () => {
      const business = await makeBusiness("accept-overdue");
      const customer = await prisma.customer.create({ data: { businessId: business.id, name: "C" } });
      const quote = await makeQuote(business.id, customer.id, {
        status: "SENT",
        validUntil: daysFromNow(-2),
      });

      const status = await performAcceptQuote(quote.publicToken);
      expect(status).toBe("EXPIRED");
      const fromDb = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
      expect(fromDb.status).toBe("EXPIRED");
      expect(fromDb.acceptedAt).toBeNull();
    });

    it("refuses to reject a quote already marked EXPIRED", async () => {
      const business = await makeBusiness("reject-expired");
      const customer = await prisma.customer.create({ data: { businessId: business.id, name: "C" } });
      const quote = await makeQuote(business.id, customer.id, { status: "EXPIRED" });

      const status = await performRejectQuote(quote.publicToken);
      expect(status).toBe("EXPIRED");
    });

    it("refuses to reject a VIEWED quote whose validUntil already passed", async () => {
      const business = await makeBusiness("reject-overdue");
      const customer = await prisma.customer.create({ data: { businessId: business.id, name: "C" } });
      const quote = await makeQuote(business.id, customer.id, {
        status: "VIEWED",
        validUntil: daysFromNow(-1),
      });

      const status = await performRejectQuote(quote.publicToken);
      expect(status).toBe("EXPIRED");
      const fromDb = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
      expect(fromDb.rejectedAt).toBeNull();
    });

    // The EXPIRED cases above are covered one by one because they also
    // exercise lazy expiry. These close the rest of the matrix: no finalized
    // quote may be accepted or rejected, whatever it was finalized as.
    it.each(["ACCEPTED", "REJECTED", "CANCELLED"] as QuoteStatus[])(
      "refuses to accept a quote that is already %s",
      async (finalStatus) => {
        const business = await makeBusiness(`accept-blocked-${finalStatus}`);
        const customer = await prisma.customer.create({
          data: { businessId: business.id, name: "C" },
        });
        const quote = await makeQuote(business.id, customer.id, { status: finalStatus });

        const status = await performAcceptQuote(quote.publicToken);
        expect(status).toBe(finalStatus);
        const fromDb = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
        expect(fromDb.status).toBe(finalStatus);
        expect(fromDb.acceptedAt).toBeNull();
      }
    );

    it.each(["ACCEPTED", "REJECTED", "CANCELLED"] as QuoteStatus[])(
      "refuses to reject a quote that is already %s",
      async (finalStatus) => {
        const business = await makeBusiness(`reject-blocked-${finalStatus}`);
        const customer = await prisma.customer.create({
          data: { businessId: business.id, name: "C" },
        });
        const quote = await makeQuote(business.id, customer.id, { status: finalStatus });

        const status = await performRejectQuote(quote.publicToken);
        expect(status).toBe(finalStatus);
        const fromDb = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
        expect(fromDb.status).toBe(finalStatus);
      }
    );

    it("never lets an ACCEPTED quote flip back to REJECTED", async () => {
      const business = await makeBusiness("no-flip-back");
      const customer = await prisma.customer.create({ data: { businessId: business.id, name: "C" } });
      const quote = await makeQuote(business.id, customer.id, { status: "ACCEPTED" });

      const status = await performRejectQuote(quote.publicToken);
      expect(status).toBe("ACCEPTED");
      const fromDb = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
      expect(fromDb.status).toBe("ACCEPTED");
    });
  });

  describe("performCancelQuote", () => {
    it("cancels an open quote (DRAFT/SENT/VIEWED)", async () => {
      const business = await makeBusiness("cancel-ok");
      const customer = await prisma.customer.create({ data: { businessId: business.id, name: "C" } });
      const quote = await makeQuote(business.id, customer.id, { status: "SENT" });

      const status = await performCancelQuote(business.id, quote.id);
      expect(status).toBe("CANCELLED");
    });

    it.each(["ACCEPTED", "REJECTED", "EXPIRED", "CANCELLED"] as QuoteStatus[])(
      "refuses to cancel a quote that is already %s",
      async (finalStatus) => {
        const business = await makeBusiness(`cancel-blocked-${finalStatus}`);
        const customer = await prisma.customer.create({ data: { businessId: business.id, name: "C" } });
        const quote = await makeQuote(business.id, customer.id, { status: finalStatus });

        const status = await performCancelQuote(business.id, quote.id);
        expect(status).toBe(finalStatus);
        const fromDb = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
        expect(fromDb.status).toBe(finalStatus);
      }
    );

    it("does not let one business cancel another business's quote", async () => {
      const businessA = await makeBusiness("cancel-tenant-a");
      const businessB = await makeBusiness("cancel-tenant-b");
      const customerA = await prisma.customer.create({ data: { businessId: businessA.id, name: "C" } });
      const quote = await makeQuote(businessA.id, customerA.id, { status: "SENT" });

      const status = await performCancelQuote(businessB.id, quote.id);
      expect(status).toBeNull();
      const fromDb = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
      expect(fromDb.status).toBe("SENT");
    });
  });

  describe("performRecordFollowUp", () => {
    it("records a follow-up on an open quote", async () => {
      const business = await makeBusiness("followup-ok");
      const customer = await prisma.customer.create({ data: { businessId: business.id, name: "C" } });
      const quote = await makeQuote(business.id, customer.id, { status: "SENT" });

      const status = await performRecordFollowUp(business.id, quote.id, "Hola, ¿pudiste ver el presupuesto?");
      expect(status).toBe("SENT");

      const followUps = await prisma.followUp.findMany({ where: { quoteId: quote.id } });
      expect(followUps).toHaveLength(1);
    });

    it.each(["ACCEPTED", "REJECTED", "EXPIRED", "CANCELLED"] as QuoteStatus[])(
      "does not record a follow-up on a %s quote",
      async (finalStatus) => {
        const business = await makeBusiness(`followup-blocked-${finalStatus}`);
        const customer = await prisma.customer.create({ data: { businessId: business.id, name: "C" } });
        const quote = await makeQuote(business.id, customer.id, { status: finalStatus });

        await performRecordFollowUp(business.id, quote.id, "mensaje");

        const followUps = await prisma.followUp.findMany({ where: { quoteId: quote.id } });
        expect(followUps).toHaveLength(0);
      }
    );

    it("does not record a follow-up on a quote overdue past validUntil", async () => {
      const business = await makeBusiness("followup-overdue");
      const customer = await prisma.customer.create({ data: { businessId: business.id, name: "C" } });
      const quote = await makeQuote(business.id, customer.id, {
        status: "VIEWED",
        validUntil: daysFromNow(-3),
      });

      await performRecordFollowUp(business.id, quote.id, "mensaje");

      const followUps = await prisma.followUp.findMany({ where: { quoteId: quote.id } });
      expect(followUps).toHaveLength(0);
      const fromDb = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
      expect(fromDb.status).toBe("EXPIRED");
    });
  });
});
