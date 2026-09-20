import { describe, it, expect } from "vitest";
import { signupSchema, loginSchema, newPasswordSchema } from "@/lib/validation/auth";
import { customerSchema } from "@/lib/validation/customer";
import { onboardingSchema } from "@/lib/validation/business";
import {
  quoteSchema,
  quoteItemSchema,
  computeQuoteTotals,
  followUpSchema,
} from "@/lib/validation/quote";
import { LIMITS, decimalPlaces, toDateOrNull } from "@/lib/validation/limits";

const long = (n: number) => "x".repeat(n);

function baseItem(overrides: Record<string, unknown> = {}) {
  return { description: "Mano de obra", detail: "", quantity: 1, unitPrice: 1000, ...overrides };
}

function baseQuote(overrides: Record<string, unknown> = {}) {
  return {
    customerId: "cus_123",
    items: [baseItem()],
    discount: 0,
    notes: "",
    conditions: "",
    validUntil: "",
    workDate: "",
    ...overrides,
  };
}

/** The message a schema rejected with, so tests assert on the reason, not just failure. */
function reason(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.success ? null : result.error!.issues[0]?.message ?? "";
}

describe("text limits", () => {
  it("rejects a name past the limit but accepts one at it", () => {
    expect(
      signupSchema.safeParse({
        name: long(LIMITS.personName + 1),
        email: "a@b.com",
        password: "password123",
      }).success
    ).toBe(false);

    expect(
      signupSchema.safeParse({
        name: long(LIMITS.personName),
        email: "a@b.com",
        password: "password123",
      }).success
    ).toBe(true);
  });

  it("rejects a business name past the limit", () => {
    const result = onboardingSchema.safeParse({
      businessName: long(LIMITS.businessName + 1),
      activity: "Electricista",
      phone: "",
      currency: "ARS",
    });
    expect(reason(result)).toMatch(/demasiado largo/i);
  });

  it("rejects an oversized activity, phone, address and notes on a customer", () => {
    expect(
      onboardingSchema.safeParse({
        businessName: "Taller",
        activity: long(LIMITS.activity + 1),
        phone: "",
        currency: "ARS",
      }).success
    ).toBe(false);

    expect(customerSchema.safeParse({ name: "Ana", phone: long(LIMITS.phone + 1) }).success).toBe(
      false
    );
    expect(
      customerSchema.safeParse({ name: "Ana", address: long(LIMITS.address + 1) }).success
    ).toBe(false);
    expect(customerSchema.safeParse({ name: "Ana", notes: long(LIMITS.notes + 1) }).success).toBe(
      false
    );
    // …and the ordinary case still goes through.
    expect(
      customerSchema.safeParse({ name: "Ana", phone: "+54 11 5555 5555", notes: "Portón azul" })
        .success
    ).toBe(true);
  });

  it("rejects an email longer than an email can be", () => {
    const address = `${long(LIMITS.email)}@test.com`;
    expect(customerSchema.safeParse({ name: "Ana", email: address }).success).toBe(false);
  });

  it("rejects oversized notes and conditions on a quote", () => {
    expect(quoteSchema.safeParse(baseQuote({ notes: long(LIMITS.notes + 1) })).success).toBe(false);
    expect(
      quoteSchema.safeParse(baseQuote({ conditions: long(LIMITS.conditions + 1) })).success
    ).toBe(false);
  });

  it("rejects an oversized item description and detail", () => {
    expect(
      quoteItemSchema.safeParse(baseItem({ description: long(LIMITS.itemDescription + 1) })).success
    ).toBe(false);
    expect(
      quoteItemSchema.safeParse(baseItem({ detail: long(LIMITS.itemDetail + 1) })).success
    ).toBe(false);
  });

  it("rejects an oversized follow-up message and an empty one", () => {
    expect(
      followUpSchema.safeParse({ quoteId: "q1", message: long(LIMITS.followUpMessage + 1) }).success
    ).toBe(false);
    expect(followUpSchema.safeParse({ quoteId: "q1", message: "   " }).success).toBe(false);
    expect(followUpSchema.safeParse({ quoteId: "q1", message: "¿Pudiste verlo?" }).success).toBe(
      true
    );
  });

  it("bounds a new password but stays permissive at login", () => {
    expect(newPasswordSchema.safeParse(long(LIMITS.newPassword + 1)).success).toBe(false);
    expect(newPasswordSchema.safeParse("una-clave-larga").success).toBe(true);

    // Login must not lock out an account whose password predates the limit.
    expect(
      loginSchema.safeParse({ email: "a@b.com", password: long(LIMITS.newPassword + 1) }).success
    ).toBe(true);
    // It is still bounded, as a guard against hashing a huge payload.
    expect(
      loginSchema.safeParse({ email: "a@b.com", password: long(LIMITS.loginPassword + 1) }).success
    ).toBe(false);
  });

  it("measures length after trimming, so trailing spaces don't cost the user their limit", () => {
    const atLimit = `${long(LIMITS.itemDescription)}     `;
    expect(quoteItemSchema.safeParse(baseItem({ description: atLimit })).success).toBe(true);
  });
});

describe("numeric limits", () => {
  it("rejects a quantity of zero or below", () => {
    expect(quoteItemSchema.safeParse(baseItem({ quantity: 0 })).success).toBe(false);
    expect(quoteItemSchema.safeParse(baseItem({ quantity: -3 })).success).toBe(false);
  });

  it("rejects an absurd quantity", () => {
    expect(quoteItemSchema.safeParse(baseItem({ quantity: LIMITS.maxQuantity + 1 })).success).toBe(
      false
    );
    expect(quoteItemSchema.safeParse(baseItem({ quantity: 1e12 })).success).toBe(false);
  });

  it("rejects NaN and Infinity arriving as form strings", () => {
    for (const value of ["abc", "Infinity", "-Infinity", "NaN", "1e400"]) {
      expect(quoteItemSchema.safeParse(baseItem({ quantity: value })).success).toBe(false);
      expect(quoteItemSchema.safeParse(baseItem({ unitPrice: value })).success).toBe(false);
    }
  });

  it("rejects a quantity with more precision than Decimal(10,2) can hold", () => {
    // Postgres would round this on the way in, silently changing what was typed.
    expect(quoteItemSchema.safeParse(baseItem({ quantity: 1.005 })).success).toBe(false);
    expect(quoteItemSchema.safeParse(baseItem({ quantity: 1.25 })).success).toBe(true);
  });

  it("rejects a negative, fractional or absurd unit price", () => {
    expect(quoteItemSchema.safeParse(baseItem({ unitPrice: -1 })).success).toBe(false);
    // The column is an Int; a price with cents would be rounded behind the user's back.
    expect(quoteItemSchema.safeParse(baseItem({ unitPrice: 1500.5 })).success).toBe(false);
    expect(
      quoteItemSchema.safeParse(baseItem({ unitPrice: LIMITS.maxUnitPrice + 1 })).success
    ).toBe(false);
    // Zero is legitimate: an item thrown in for free.
    expect(quoteItemSchema.safeParse(baseItem({ unitPrice: 0 })).success).toBe(true);
  });

  it("rejects a negative discount and one above the subtotal", () => {
    expect(quoteSchema.safeParse(baseQuote({ discount: -1 })).success).toBe(false);

    const quote = baseQuote({ items: [baseItem({ quantity: 1, unitPrice: 1000 })], discount: 1001 });
    expect(reason(quoteSchema.safeParse(quote))).toMatch(/mayor al subtotal/i);

    // Exactly the subtotal is allowed: a fully discounted quote totals zero.
    expect(
      quoteSchema.safeParse(
        baseQuote({ items: [baseItem({ quantity: 1, unitPrice: 1000 })], discount: 1000 })
      ).success
    ).toBe(true);
  });

  it("rejects a quote whose total would overflow the money columns", () => {
    const huge = baseQuote({
      items: [baseItem({ quantity: LIMITS.maxQuantity, unitPrice: LIMITS.maxUnitPrice })],
    });
    // Each field is individually legal; their product is not.
    expect(quoteItemSchema.safeParse(huge.items[0]).success).toBe(true);
    expect(reason(quoteSchema.safeParse(huge))).toMatch(/demasiado alto/i);
  });

  it("rejects more items than a quote may hold", () => {
    const items = Array.from({ length: LIMITS.maxItemsPerQuote + 1 }, () => baseItem());
    expect(reason(quoteSchema.safeParse(baseQuote({ items })))).toMatch(/hasta \d+ ítems/i);

    const atLimit = Array.from({ length: LIMITS.maxItemsPerQuote }, () => baseItem());
    expect(quoteSchema.safeParse(baseQuote({ items: atLimit })).success).toBe(true);
  });

  it("requires at least one item", () => {
    expect(quoteSchema.safeParse(baseQuote({ items: [] })).success).toBe(false);
  });

  it("counts decimal places without floating point surprises", () => {
    expect(decimalPlaces(1)).toBe(0);
    expect(decimalPlaces(1.5)).toBe(1);
    expect(decimalPlaces(1.25)).toBe(2);
    expect(decimalPlaces(1.005)).toBe(3);
    // Exponential notation can't be counted digit by digit, so it's refused.
    expect(decimalPlaces(1e-7)).toBe(Infinity);
  });
});

describe("dates", () => {
  it("rejects junk instead of letting it become an Invalid Date", () => {
    for (const value of ["basura", "2026-13-45", "31/02/2026", "0000-00-00"]) {
      expect(quoteSchema.safeParse(baseQuote({ validUntil: value })).success).toBe(false);
    }
  });

  it("rejects a date far outside any plausible range", () => {
    expect(reason(quoteSchema.safeParse(baseQuote({ validUntil: "9999-12-31" })))).toMatch(
      /rango razonable/i
    );
    expect(quoteSchema.safeParse(baseQuote({ workDate: "1900-01-01" })).success).toBe(false);
  });

  it("accepts a real date and an empty one", () => {
    const soon = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    expect(quoteSchema.safeParse(baseQuote({ validUntil: soon })).success).toBe(true);
    expect(quoteSchema.safeParse(baseQuote({ validUntil: "" })).success).toBe(true);
  });

  it("converts only real dates, never an Invalid Date", () => {
    expect(toDateOrNull("")).toBeNull();
    expect(toDateOrNull(undefined)).toBeNull();
    expect(toDateOrNull("basura")).toBeNull();
    expect(toDateOrNull("2026-03-01")?.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });
});

describe("totals are the server's business", () => {
  it("drops any total the client tries to send", () => {
    const parsed = quoteSchema.parse(
      baseQuote({
        items: [baseItem({ quantity: 2, unitPrice: 100, total: 1, subtotal: 1 })],
        total: 1,
        subtotal: 1,
      })
    );

    expect(parsed.items[0]).not.toHaveProperty("total");
    expect(parsed).not.toHaveProperty("total");
    expect(computeQuoteTotals(parsed.items, parsed.discount)).toEqual({
      subtotal: 200,
      discount: 0,
      total: 200,
    });
  });

  it("never produces a negative total even if validation is bypassed", () => {
    // computeQuoteTotals is the last line of defence: the schema already
    // rejects this, so the clamp only matters for a caller that skipped it.
    expect(computeQuoteTotals([baseItem({ quantity: 1, unitPrice: 100 })], 5000)).toEqual({
      subtotal: 100,
      discount: 100,
      total: 0,
    });
  });
});
