import { describe, it, expect } from "vitest";
import {
  needsFollowUp,
  daysSince,
  isFinalized,
  canTransition,
  isPastValidUntil,
  QUOTE_TRANSITIONS,
  FOLLOW_UP_THRESHOLD_DAYS,
} from "@/lib/quote-service";
import type { QuoteStatus } from "@prisma/client";

function daysAgo(n: number) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

describe("needsFollowUp", () => {
  it("is false for a draft that was never sent", () => {
    expect(needsFollowUp({ status: "DRAFT", sentAt: null, validUntil: null })).toBe(false);
  });

  it("is false for a quote sent recently", () => {
    expect(needsFollowUp({ status: "SENT", sentAt: daysAgo(1), validUntil: null })).toBe(false);
  });

  it("is true once the threshold has passed and still open", () => {
    expect(
      needsFollowUp({ status: "SENT", sentAt: daysAgo(FOLLOW_UP_THRESHOLD_DAYS), validUntil: null })
    ).toBe(true);
    expect(
      needsFollowUp({ status: "VIEWED", sentAt: daysAgo(FOLLOW_UP_THRESHOLD_DAYS + 2), validUntil: null })
    ).toBe(true);
  });

  it("is false once accepted or rejected, even if old", () => {
    expect(needsFollowUp({ status: "ACCEPTED", sentAt: daysAgo(30), validUntil: null })).toBe(false);
    expect(needsFollowUp({ status: "REJECTED", sentAt: daysAgo(30), validUntil: null })).toBe(false);
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
  // EXPIRED moved here in Bloque 1 hardening: it used to be (incorrectly)
  // treated as "open", which let an expired quote still be accepted/rejected
  // from the public page.
  it("treats ACCEPTED, REJECTED, EXPIRED and CANCELLED as final", () => {
    expect(isFinalized("ACCEPTED")).toBe(true);
    expect(isFinalized("REJECTED")).toBe(true);
    expect(isFinalized("EXPIRED")).toBe(true);
    expect(isFinalized("CANCELLED")).toBe(true);
  });

  it("treats DRAFT, SENT and VIEWED as open", () => {
    expect(isFinalized("DRAFT")).toBe(false);
    expect(isFinalized("SENT")).toBe(false);
    expect(isFinalized("VIEWED")).toBe(false);
  });
});

describe("canTransition", () => {
  it("allows every documented transition in QUOTE_TRANSITIONS", () => {
    for (const [from, targets] of Object.entries(QUOTE_TRANSITIONS)) {
      for (const to of targets) {
        expect(canTransition(from as QuoteStatus, to)).toBe(true);
      }
    }
  });

  it("blocks any transition out of a final status", () => {
    const finalStatuses: QuoteStatus[] = ["ACCEPTED", "REJECTED", "EXPIRED", "CANCELLED"];
    const allStatuses: QuoteStatus[] = [...finalStatuses, "DRAFT", "SENT", "VIEWED"];
    for (const from of finalStatuses) {
      for (const to of allStatuses) {
        expect(canTransition(from, to)).toBe(false);
      }
    }
  });

  it("blocks going back to an earlier active status", () => {
    expect(canTransition("SENT", "DRAFT")).toBe(false);
    expect(canTransition("VIEWED", "SENT")).toBe(false);
  });

  it("blocks skipping straight from DRAFT to a post-send status", () => {
    expect(canTransition("DRAFT", "VIEWED")).toBe(false);
    expect(canTransition("DRAFT", "ACCEPTED")).toBe(false);
    expect(canTransition("DRAFT", "REJECTED")).toBe(false);
    expect(canTransition("DRAFT", "EXPIRED")).toBe(false);
  });

  it("allows the expected valid transitions explicitly", () => {
    expect(canTransition("DRAFT", "SENT")).toBe(true);
    expect(canTransition("DRAFT", "CANCELLED")).toBe(true);
    expect(canTransition("SENT", "VIEWED")).toBe(true);
    expect(canTransition("SENT", "ACCEPTED")).toBe(true);
    expect(canTransition("VIEWED", "ACCEPTED")).toBe(true);
    expect(canTransition("VIEWED", "REJECTED")).toBe(true);
  });
});

describe("isPastValidUntil", () => {
  it("is false when there is no validUntil date", () => {
    expect(isPastValidUntil(null)).toBe(false);
  });

  it("is false for a future date", () => {
    expect(isPastValidUntil(new Date(Date.now() + 24 * 60 * 60 * 1000))).toBe(false);
  });

  it("is true for a past date", () => {
    expect(isPastValidUntil(new Date(Date.now() - 24 * 60 * 60 * 1000))).toBe(true);
  });
});
