import { describe, it, expect } from "vitest";
import { computeQuoteTotals } from "@/lib/validation/quote";

describe("computeQuoteTotals", () => {
  it("sums quantity * unitPrice across items", () => {
    const totals = computeQuoteTotals(
      [
        { description: "Mano de obra", quantity: 1, unitPrice: 150000 },
        { description: "Materiales", quantity: 1, unitPrice: 50000 },
      ],
      0
    );
    expect(totals.subtotal).toBe(200000);
    expect(totals.discount).toBe(0);
    expect(totals.total).toBe(200000);
  });

  it("applies a discount without going negative", () => {
    const totals = computeQuoteTotals(
      [{ description: "Servicio", quantity: 2, unitPrice: 1000 }],
      500
    );
    expect(totals.subtotal).toBe(2000);
    expect(totals.discount).toBe(500);
    expect(totals.total).toBe(1500);
  });

  it("clamps a discount larger than the subtotal", () => {
    const totals = computeQuoteTotals(
      [{ description: "Servicio", quantity: 1, unitPrice: 100 }],
      99999
    );
    expect(totals.discount).toBe(100);
    expect(totals.total).toBe(0);
  });

  it("rounds fractional quantities correctly", () => {
    const totals = computeQuoteTotals(
      [{ description: "Cable por metro", quantity: 2.5, unitPrice: 1000 }],
      0
    );
    expect(totals.subtotal).toBe(2500);
  });
});
