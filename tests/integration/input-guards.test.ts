import { describe, it, expect, afterAll, vi } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { Business } from "@prisma/client";
import { LIMITS } from "@/lib/validation/limits";
import { parseStatusFilter } from "@/lib/quote-service";

/**
 * These drive the real Server Actions with only the session mocked — the
 * same thing someone could do by invoking an action directly, bypassing
 * every check the form does in the browser.
 */
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

const { createQuoteAction, recordFollowUpAction } = await import("@/lib/actions/quotes");
const { createCustomerAction } = await import("@/lib/actions/customers");

const userIds: string[] = [];

async function makeBusiness(tag: string) {
  const passwordHash = await bcrypt.hash("password123", 4);
  const user = await prisma.user.create({
    data: {
      name: `Owner ${tag}`,
      email: `guards_${tag}_${Date.now()}_${Math.random()}@test.local`,
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
      subscription: { create: { plan: "STARTER" } },
    },
  });
}

async function makeCustomer(businessId: string) {
  return prisma.customer.create({ data: { businessId, name: "Cliente de prueba" } });
}

function quoteForm(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("server actions reject invalid input", () => {
  afterAll(async () => {
    session.business = null;
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("refuses a quote with junk in a date field and writes nothing", async () => {
    const business = await makeBusiness("bad-date");
    session.business = business;
    const customer = await makeCustomer(business.id);

    const result = await createQuoteAction(
      undefined,
      quoteForm({
        customerId: customer.id,
        itemsJson: JSON.stringify([{ description: "Mano de obra", quantity: 1, unitPrice: 1000 }]),
        discount: "0",
        validUntil: "no-es-una-fecha",
      })
    );

    expect(result?.error).toMatch(/fecha no es válida/i);
    expect(await prisma.quote.count({ where: { businessId: business.id } })).toBe(0);
  });

  it("refuses absurd numbers rather than letting them reach the database", async () => {
    const business = await makeBusiness("absurd-numbers");
    session.business = business;
    const customer = await makeCustomer(business.id);

    // Big enough to overflow the Int columns the totals are stored in.
    const result = await createQuoteAction(
      undefined,
      quoteForm({
        customerId: customer.id,
        itemsJson: JSON.stringify([
          { description: "Mano de obra", quantity: LIMITS.maxQuantity, unitPrice: LIMITS.maxUnitPrice },
        ]),
        discount: "0",
      })
    );

    expect(result?.error).toMatch(/demasiado alto/i);
    expect(await prisma.quote.count({ where: { businessId: business.id } })).toBe(0);
  });

  it("recomputes the totals and ignores anything the client sends", async () => {
    const business = await makeBusiness("client-totals");
    session.business = business;
    const customer = await makeCustomer(business.id);

    await expect(
      createQuoteAction(
        undefined,
        quoteForm({
          customerId: customer.id,
          // A tampered payload: real prices, but totals claiming the job is free.
          itemsJson: JSON.stringify([
            { description: "Mano de obra", quantity: 2, unitPrice: 1000, total: 1 },
          ]),
          discount: "0",
          subtotal: "1",
          total: "1",
        })
      )
    ).rejects.toBeInstanceOf(RedirectSignal);

    const quote = await prisma.quote.findFirstOrThrow({
      where: { businessId: business.id },
      include: { items: true },
    });
    expect(quote.subtotal).toBe(2000);
    expect(quote.total).toBe(2000);
    expect(quote.items[0].total).toBe(2000);
  });

  it("refuses a discount larger than the subtotal", async () => {
    const business = await makeBusiness("big-discount");
    session.business = business;
    const customer = await makeCustomer(business.id);

    const result = await createQuoteAction(
      undefined,
      quoteForm({
        customerId: customer.id,
        itemsJson: JSON.stringify([{ description: "Mano de obra", quantity: 1, unitPrice: 1000 }]),
        discount: "5000",
      })
    );

    expect(result?.error).toMatch(/mayor al subtotal/i);
    expect(await prisma.quote.count({ where: { businessId: business.id } })).toBe(0);
  });

  it("refuses more items than a quote may hold", async () => {
    const business = await makeBusiness("many-items");
    session.business = business;
    const customer = await makeCustomer(business.id);

    const items = Array.from({ length: LIMITS.maxItemsPerQuote + 1 }, () => ({
      description: "Ítem",
      quantity: 1,
      unitPrice: 10,
    }));
    const result = await createQuoteAction(
      undefined,
      quoteForm({
        customerId: customer.id,
        itemsJson: JSON.stringify(items),
        discount: "0",
      })
    );

    expect(result?.error).toMatch(/hasta \d+ ítems/i);
    expect(await prisma.quote.count({ where: { businessId: business.id } })).toBe(0);
  });

  it("refuses an oversized customer name and note", async () => {
    const business = await makeBusiness("long-customer");
    session.business = business;

    const result = await createCustomerAction(
      undefined,
      quoteForm({ name: "x".repeat(LIMITS.personName + 1), notes: "" })
    );
    expect(result?.error).toMatch(/demasiado largo/i);

    const withLongNote = await createCustomerAction(
      undefined,
      quoteForm({ name: "Ana", notes: "x".repeat(LIMITS.notes + 1) })
    );
    expect(withLongNote?.error).toMatch(/demasiado largas/i);

    expect(await prisma.customer.count({ where: { businessId: business.id } })).toBe(0);
  });

  it("refuses an oversized follow-up message without recording it", async () => {
    const business = await makeBusiness("long-followup");
    session.business = business;
    const customer = await makeCustomer(business.id);

    const quote = await prisma.quote.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        number: 1,
        publicToken: `tok_${Date.now()}_${Math.random()}`,
        currency: "ARS",
        subtotal: 1000,
        total: 1000,
        status: "SENT",
        sentAt: new Date(),
      },
    });

    const result = await recordFollowUpAction(quote.id, "x".repeat(LIMITS.followUpMessage + 1));
    expect(result?.error).toMatch(/demasiado largo/i);
    expect(await prisma.followUp.count({ where: { quoteId: quote.id } })).toBe(0);

    // The ordinary case still records.
    const ok = await recordFollowUpAction(quote.id, "Hola, ¿pudiste verlo?");
    expect(ok?.error).toBeUndefined();
    expect(await prisma.followUp.count({ where: { quoteId: quote.id } })).toBe(1);
  });
});

describe("the ?status= filter", () => {
  it("passes through the statuses that exist", () => {
    expect(parseStatusFilter("SENT")).toBe("SENT");
    expect(parseStatusFilter("ACCEPTED")).toBe("ACCEPTED");
  });

  it("falls back to ALL for anything else", () => {
    expect(parseStatusFilter(undefined)).toBe("ALL");
    expect(parseStatusFilter("")).toBe("ALL");
    expect(parseStatusFilter("ALL")).toBe("ALL");
    expect(parseStatusFilter("BASURA")).toBe("ALL");
    expect(parseStatusFilter("sent")).toBe("ALL");
    expect(parseStatusFilter("'; DROP TABLE Quote; --")).toBe("ALL");
  });

  it("is necessary: an unknown status reaches Prisma as an error, not an empty list", async () => {
    // This is why the filter can't be passed straight through from the URL —
    // without the guard the whole page renders as a 500.
    await expect(
      prisma.quote.findMany({ where: { status: "BASURA" as never } })
    ).rejects.toBeTruthy();
  });
});
