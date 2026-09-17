import { describe, it, expect } from "vitest";
import { needsFollowUp, daysSince, isFinalized, FOLLOW_UP_THRESHOLD_DAYS } from "@/lib/quote-service";

function daysAgo(n: number) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

describe("needsFollowUp", () => {
  it("is false for a draft that was never sent", () => {
    expect(needsFollowUp({ status: "DRAFT", sentAt: null })).toBe(false);
  });

  it("is false for a quote sent recently", () => {
    expect(needsFollowUp({ status: "SENT", sentAt: daysAgo(1) })).toBe(false);
  });

  it("is true once the threshold has passed and still open", () => {
    expect(
      needsFollowUp({ status: "SENT", sentAt: daysAgo(FOLLOW_UP_THRESHOLD_DAYS) })
    ).toBe(true);
    expect(
      needsFollowUp({ status: "VIEWED", sentAt: daysAgo(FOLLOW_UP_THRESHOLD_DAYS + 2) })
    ).toBe(true);
  });

  it("is false once accepted or rejected, even if old", () => {
    expect(needsFollowUp({ status: "ACCEPTED", sentAt: daysAgo(30) })).toBe(false);
    expect(needsFollowUp({ status: "REJECTED", sentAt: daysAgo(30) })).toBe(false);
  });
});

describe("daysSince", () => {
  it("returns 0 for a timestamp from just now", () => {
    expect(daysSince(new Date())).toBe(0);
  });

  it("returns the correct integer number of days", () => {
    expect(daysSince(daysAgo(5))).toBe(5);
  });
});

describe("isFinalized", () => {
  it("treats ACCEPTED, REJECTED and CANCELLED as final", () => {
    expect(isFinalized("ACCEPTED")).toBe(true);
    expect(isFinalized("REJECTED")).toBe(true);
    expect(isFinalized("CANCELLED")).toBe(true);
  });

  it("treats DRAFT, SENT, VIEWED and EXPIRED as open", () => {
    expect(isFinalized("DRAFT")).toBe(false);
    expect(isFinalized("SENT")).toBe(false);
    expect(isFinalized("VIEWED")).toBe(false);
    expect(isFinalized("EXPIRED")).toBe(false);
  });
});
