import { describe, it, expect, afterAll, vi } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { Business } from "@prisma/client";
import { effectiveStatus, quoteListWhere, needsFollowUp } from "@/lib/quote-service";
import { settleExpiration } from "@/lib/quote-lifecycle";

/**
 * What the screens show, rather than what the database last wrote.
 *
 * Expiration is settled lazily, so a quote that has lapsed still has
 * `status: "SENT"` in its row until somebody opens it. Everything here is
 * about that gap: the badge, the filter and the follow-up list all have to
 * agree with what the customer sees on the public page.
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

const { createQuoteAction } = await import("@/lib/actions/quotes");
const { createCustomerInlineAction } = await import("@/lib/actions/customers");

const userIds: string[] = [];
const DAY = 24 * 60 * 60 * 1000;
const yesterday = () => new Date(Date.now() - DAY);
const tomorrow = () => new Date(Date.now() + DAY);

async function makeBusiness(tag: string, plan: "FREE" | "STARTER" = "STARTER") {
  const user = await prisma.user.create({
    data: {
      name: `Owner ${tag}`,
      email: `ux_${tag}_${Date.now()}_${Math.random()}@test.local`,
      passwordHash: await bcrypt.hash("password123", 4),
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

async function makeQuote(
  businessId: string,
  customerId: string,
  number: number,
  status: "DRAFT" | "SENT" | "VIEWED" | "ACCEPTED" | "EXPIRED" | "CANCELLED",
  validUntil: Date | null
) {
  return prisma.quote.create({
    data: {
      businessId,
      customerId,
      number,
      publicToken: `ux_${Date.now()}_${Math.random()}`,
      currency: "ARS",
      subtotal: 1000,
      total: 1000,
      status,
      validUntil,
      sentAt: status === "DRAFT" ? null : new Date(Date.now() - 10 * DAY),
    },
  });
}

afterAll(async () => {
  session.business = null;
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("effectiveStatus", () => {
  it("shows an overdue open quote as expired", () => {
    expect(effectiveStatus({ status: "SENT", validUntil: yesterday() })).toBe("EXPIRED");
    expect(effectiveStatus({ status: "VIEWED", validUntil: yesterday() })).toBe("EXPIRED");
  });

  it("leaves a quote that is still valid alone", () => {
    expect(effectiveStatus({ status: "SENT", validUntil: tomorrow() })).toBe("SENT");
    expect(effectiveStatus({ status: "SENT", validUntil: null })).toBe("SENT");
  });

  it("never expires a draft, because DRAFT -> EXPIRED is not a legal transition", () => {
    // This has to match settleExpiration, which can't move a draft either.
    expect(effectiveStatus({ status: "DRAFT", validUntil: yesterday() })).toBe("DRAFT");
  });

  it("never reopens or overrides a finalized quote", () => {
    for (const status of ["ACCEPTED", "REJECTED", "CANCELLED", "EXPIRED"] as const) {
      expect(effectiveStatus({ status, validUntil: yesterday() })).toBe(status);
      expect(effectiveStatus({ status, validUntil: tomorrow() })).toBe(status);
    }
  });
});

describe("effectiveStatus agrees with settleExpiration", () => {
  /**
   * The same rule now lives in two places: `settleExpiration` writes it, and
   * `effectiveStatus` displays it without writing. They can drift apart
   * silently — a screen would show one thing and the database would do
   * another — so this pins them to each other across the whole matrix
   * rather than trusting that they were written to match.
   */
  const statuses = ["DRAFT", "SENT", "VIEWED", "ACCEPTED", "EXPIRED", "CANCELLED"] as const;
  const windows: [string, Date | null][] = [
    ["vencido", yesterday()],
    ["vigente", tomorrow()],
    ["sin fecha", null],
  ];

  it("gives the same answer as the write path for every status and window", async () => {
    const business = await makeBusiness("agreement");
    const customer = await prisma.customer.create({
      data: { businessId: business.id, name: "Cliente" },
    });

    let number = 100;
    for (const status of statuses) {
      for (const [label, validUntil] of windows) {
        const quote = await makeQuote(business.id, customer.id, number++, status, validUntil);

        const displayed = effectiveStatus(quote);
        const written = await settleExpiration(quote);

        expect(
          displayed,
          `${status} / ${label}: la pantalla diría ${displayed} y la base escribiría ${written}`
        ).toBe(written);
      }
    }
  });
});

describe("the status filter on the quotes list", () => {
  it("puts every quote where the user would look for it", async () => {
    const business = await makeBusiness("filter");
    const customer = await prisma.customer.create({
      data: { businessId: business.id, name: "Cliente" },
    });

    const draft = await makeQuote(business.id, customer.id, 1, "DRAFT", null);
    const live = await makeQuote(business.id, customer.id, 2, "SENT", tomorrow());
    const overdue = await makeQuote(business.id, customer.id, 3, "SENT", yesterday());
    const settled = await makeQuote(business.id, customer.id, 4, "EXPIRED", yesterday());
    const accepted = await makeQuote(business.id, customer.id, 5, "ACCEPTED", yesterday());

    async function idsFor(filter: Parameters<typeof quoteListWhere>[0]) {
      const rows = await prisma.quote.findMany({
        where: { businessId: business.id, deletedAt: null, ...quoteListWhere(filter) },
        select: { id: true },
      });
      return rows.map((r) => r.id).sort();
    }

    // The lapsed-but-unsettled quote is the whole point: it belongs under
    // "Vencido" even though its row still says SENT.
    expect(await idsFor("EXPIRED")).toEqual([overdue.id, settled.id].sort());
    // …and it must not show up under "Enviado", where it would look active.
    expect(await idsFor("SENT")).toEqual([live.id]);

    expect(await idsFor("DRAFT")).toEqual([draft.id]);
    expect(await idsFor("ACCEPTED")).toEqual([accepted.id]);
    expect(await idsFor("ALL")).toHaveLength(5);
  });
});

describe("follow-up suggestions", () => {
  it("does not ask you to chase a quote that already expired", () => {
    const sentLongAgo = new Date(Date.now() - 10 * DAY);
    expect(needsFollowUp({ status: "SENT", sentAt: sentLongAgo, validUntil: tomorrow() })).toBe(
      true
    );
    expect(needsFollowUp({ status: "SENT", sentAt: sentLongAgo, validUntil: yesterday() })).toBe(
      false
    );
  });
});

describe("the item detail field", () => {
  it("survives the round trip from the form to the screen", async () => {
    const business = await makeBusiness("detail");
    session.business = business;
    const customer = await prisma.customer.create({
      data: { businessId: business.id, name: "Cliente" },
    });

    const form = new FormData();
    form.set("customerId", customer.id);
    form.set(
      "itemsJson",
      JSON.stringify([
        {
          description: "Instalación de tablero",
          detail: "Incluye 4 llaves térmicas marca Schneider",
          quantity: 1,
          unitPrice: 50000,
        },
      ])
    );
    form.set("discount", "0");

    await expect(createQuoteAction(undefined, form)).rejects.toBeInstanceOf(RedirectSignal);

    const quote = await prisma.quote.findFirstOrThrow({
      where: { businessId: business.id },
      include: { items: true },
    });
    expect(quote.items[0].detail).toBe("Incluye 4 llaves térmicas marca Schneider");
  });

  it("stores an empty detail as null rather than an empty string", async () => {
    const business = await makeBusiness("detail-empty");
    session.business = business;
    const customer = await prisma.customer.create({
      data: { businessId: business.id, name: "Cliente" },
    });

    const form = new FormData();
    form.set("customerId", customer.id);
    form.set(
      "itemsJson",
      JSON.stringify([{ description: "Mano de obra", detail: "", quantity: 1, unitPrice: 1000 }])
    );
    form.set("discount", "0");

    await expect(createQuoteAction(undefined, form)).rejects.toBeInstanceOf(RedirectSignal);

    const quote = await prisma.quote.findFirstOrThrow({
      where: { businessId: business.id },
      include: { items: true },
    });
    // The view renders the detail only when there is one, so the two have to
    // stay distinguishable.
    expect(quote.items[0].detail).toBeNull();
  });
});

describe("creating a customer without leaving the quote", () => {
  it("returns the new customer so the form can select it", async () => {
    const business = await makeBusiness("inline-customer");
    session.business = business;

    const result = await createCustomerInlineAction("Ana Gómez", "11 5555 5555");

    expect(result.error).toBeUndefined();
    expect(result.customer?.name).toBe("Ana Gómez");

    const stored = await prisma.customer.findUniqueOrThrow({
      where: { id: result.customer!.id },
    });
    expect(stored.businessId).toBe(business.id);
    expect(stored.phone).toBe("11 5555 5555");
  });

  it("applies the same validation as the full form", async () => {
    const business = await makeBusiness("inline-invalid");
    session.business = business;

    const tooLong = await createCustomerInlineAction("x".repeat(200), "");
    expect(tooLong.error).toMatch(/demasiado largo/i);

    const tooShort = await createCustomerInlineAction("A", "");
    expect(tooShort.error).toBeTruthy();

    expect(await prisma.customer.count({ where: { businessId: business.id } })).toBe(0);
  });

  it("still enforces the plan limit", async () => {
    const business = await makeBusiness("inline-limit", "FREE");
    session.business = business;

    // FREE allows 15 customers; fill it up, then try one more.
    await prisma.customer.createMany({
      data: Array.from({ length: 15 }, (_, i) => ({
        businessId: business.id,
        name: `Cliente ${i}`,
      })),
    });

    const result = await createCustomerInlineAction("Uno de más", "");
    expect(result.error).toBeTruthy();
    expect(result.customer).toBeUndefined();
    expect(await prisma.customer.count({ where: { businessId: business.id } })).toBe(15);
  });
});
