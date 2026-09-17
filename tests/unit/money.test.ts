import { describe, it, expect } from "vitest";
import { formatMoney } from "@/lib/money";

describe("formatMoney", () => {
  it("formats ARS without decimals", () => {
    expect(formatMoney(250000, "ARS")).toContain("250.000");
  });

  it("formats USD with the correct symbol", () => {
    expect(formatMoney(100, "USD")).toContain("100");
    expect(formatMoney(100, "USD")).toContain("$");
  });
});
