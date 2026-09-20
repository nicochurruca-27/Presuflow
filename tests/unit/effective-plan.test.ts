import { describe, it, expect } from "vitest";
import { effectivePlan } from "@/lib/billing/entitlements";
import type { PlanId, SubscriptionStatus } from "@prisma/client";

const NOW = new Date("2026-06-15T12:00:00Z");
const FUTURE = new Date("2026-07-15T12:00:00Z");
const PAST = new Date("2026-05-15T12:00:00Z");

function sub(
  plan: PlanId,
  status: SubscriptionStatus,
  currentPeriodEnd: Date | null
) {
  return { plan, status, currentPeriodEnd };
}

describe("effectivePlan", () => {
  it("falls back to FREE when there is no subscription row at all", () => {
    expect(effectivePlan(null, NOW)).toBe("FREE");
  });

  it("keeps a FREE plan on FREE whatever its status says", () => {
    expect(effectivePlan(sub("FREE", "ACTIVE", null), NOW)).toBe("FREE");
    expect(effectivePlan(sub("FREE", "PAST_DUE", FUTURE), NOW)).toBe("FREE");
    expect(effectivePlan(sub("FREE", "CANCELLED", FUTURE), NOW)).toBe("FREE");
  });

  describe("ACTIVE", () => {
    it("grants the paid plan while the period is still running", () => {
      expect(effectivePlan(sub("STARTER", "ACTIVE", FUTURE), NOW)).toBe("STARTER");
      expect(effectivePlan(sub("PRO", "ACTIVE", FUTURE), NOW)).toBe("PRO");
    });

    it("grants the paid plan when no period end is recorded (plan set by hand)", () => {
      expect(effectivePlan(sub("STARTER", "ACTIVE", null), NOW)).toBe("STARTER");
    });

    it("falls back to FREE once the paid period has passed", () => {
      expect(effectivePlan(sub("STARTER", "ACTIVE", PAST), NOW)).toBe("FREE");
      expect(effectivePlan(sub("PRO", "ACTIVE", PAST), NOW)).toBe("FREE");
    });
  });

  describe("CANCELLED", () => {
    it("keeps the plan until the period they already paid for ends", () => {
      expect(effectivePlan(sub("PRO", "CANCELLED", FUTURE), NOW)).toBe("PRO");
    });

    it("falls back to FREE once that period ends", () => {
      expect(effectivePlan(sub("PRO", "CANCELLED", PAST), NOW)).toBe("FREE");
    });

    it("falls back to FREE immediately when there is no period to honour", () => {
      expect(effectivePlan(sub("PRO", "CANCELLED", null), NOW)).toBe("FREE");
    });
  });

  describe("PAST_DUE", () => {
    it("keeps the plan during the paid period, so a failed retry doesn't lock the user out", () => {
      expect(effectivePlan(sub("STARTER", "PAST_DUE", FUTURE), NOW)).toBe("STARTER");
    });

    it("falls back to FREE once the period has passed", () => {
      expect(effectivePlan(sub("STARTER", "PAST_DUE", PAST), NOW)).toBe("FREE");
    });

    it("falls back to FREE when there is no period recorded", () => {
      expect(effectivePlan(sub("STARTER", "PAST_DUE", null), NOW)).toBe("FREE");
    });
  });

  it("never grants paid benefits indefinitely on a stale row", () => {
    const longExpired = new Date("2020-01-01T00:00:00Z");
    for (const status of ["ACTIVE", "CANCELLED", "PAST_DUE"] as SubscriptionStatus[]) {
      expect(effectivePlan(sub("PRO", status, longExpired), NOW)).toBe("FREE");
    }
  });
});
