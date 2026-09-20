import { describe, it, expect, afterEach } from "vitest";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import {
  checkRateLimit,
  pruneRateLimitWindows,
  rateLimitByIp,
  RATE_LIMITS,
  type RateLimitRule,
} from "@/lib/rate-limit";

/**
 * Time is injected rather than waited on, so these are deterministic and
 * fast: moving to the next window is just passing a later Date.
 */
const MINUTE = 60 * 1000;
const rule: RateLimitRule = { limit: 3, windowMs: 10 * MINUTE };
const BASE = new Date("2026-06-15T12:00:00Z");

function at(offsetMs: number) {
  return new Date(BASE.getTime() + offsetMs);
}

const usedKeys: string[] = [];
function freshKey(tag: string) {
  const key = `test:${tag}:${nanoid(10)}`;
  usedKeys.push(key);
  return key;
}

describe("rate limiting", () => {
  afterEach(async () => {
    await prisma.rateLimitWindow.deleteMany({ where: { key: { in: usedKeys } } });
    usedKeys.length = 0;
  });

  it("allows attempts up to the limit and blocks the next one", async () => {
    const key = freshKey("basic");

    const first = await checkRateLimit(key, rule, at(0));
    expect(first.allowed).toBe(true);
    expect(first.used).toBe(1);
    expect(first.remaining).toBe(2);

    expect((await checkRateLimit(key, rule, at(MINUTE))).allowed).toBe(true);
    expect((await checkRateLimit(key, rule, at(2 * MINUTE))).allowed).toBe(true);

    const blocked = await checkRateLimit(key, rule, at(3 * MINUTE));
    expect(blocked.allowed).toBe(false);
    expect(blocked.used).toBe(4);
    expect(blocked.remaining).toBe(0);
  });

  it("starts a fresh allowance in the next window", async () => {
    const key = freshKey("window-roll");

    for (let i = 0; i < rule.limit; i++) {
      await checkRateLimit(key, rule, at(i * MINUTE));
    }
    expect((await checkRateLimit(key, rule, at(5 * MINUTE))).allowed).toBe(false);

    // Past the window boundary the counter restarts.
    const nextWindow = await checkRateLimit(key, rule, at(rule.windowMs + MINUTE));
    expect(nextWindow.allowed).toBe(true);
    expect(nextWindow.used).toBe(1);
  });

  it("reports when the current window resets", async () => {
    const key = freshKey("reset-at");
    const result = await checkRateLimit(key, rule, at(MINUTE));

    // Windows are aligned to absolute time, not to the first request.
    const expectedStart = Math.floor(at(MINUTE).getTime() / rule.windowMs) * rule.windowMs;
    expect(result.resetAt.getTime()).toBe(expectedStart + rule.windowMs);
  });

  it("counts each key independently", async () => {
    const keyA = freshKey("independent-a");
    const keyB = freshKey("independent-b");

    for (let i = 0; i < rule.limit + 1; i++) {
      await checkRateLimit(keyA, rule, at(i * 1000));
    }
    expect((await checkRateLimit(keyA, rule, at(0))).allowed).toBe(false);
    // B is untouched by A being exhausted.
    expect((await checkRateLimit(keyB, rule, at(0))).allowed).toBe(true);
  });

  it("counts concurrent attempts without losing any (shared, atomic state)", async () => {
    const key = freshKey("concurrent");

    // Ten simultaneous attempts against a limit of 3.
    const results = await Promise.all(
      Array.from({ length: 10 }, () => checkRateLimit(key, rule, at(0)))
    );

    const allowed = results.filter((r) => r.allowed);
    expect(allowed).toHaveLength(rule.limit);
    // Every attempt got a distinct slot — none were lost to a read/write race.
    expect(new Set(results.map((r) => r.used)).size).toBe(10);

    const row = await prisma.rateLimitWindow.findFirstOrThrow({ where: { key } });
    expect(row.count).toBe(10);
  });

  it("prunes counters from windows that are long gone", async () => {
    const key = freshKey("prune");
    await checkRateLimit(key, rule, at(-7 * 24 * 60 * MINUTE));
    await checkRateLimit(key, rule, at(0));

    const removed = await pruneRateLimitWindows(at(-24 * 60 * MINUTE));
    expect(removed).toBeGreaterThanOrEqual(1);

    const left = await prisma.rateLimitWindow.findMany({ where: { key } });
    expect(left).toHaveLength(1);
  });

  it("does not lump every caller together when the IP is unknown", async () => {
    // getRequestIp() returns "unknown" when there is no x-forwarded-for. If
    // that were used as a key, unrelated people would share one allowance
    // and lock each other out, which is a worse outage than the abuse being
    // prevented. Far more attempts than the rule allows must all pass.
    // Clear any residue so the "nothing was written" assertion below is
    // about this run only.
    await prisma.rateLimitWindow.deleteMany({ where: { key: { startsWith: "test:no-ip" } } });

    const attempts = await Promise.all(
      Array.from({ length: rule.limit * 4 }, () => rateLimitByIp("unknown", "test:no-ip", rule))
    );
    expect(attempts.every((a) => a.allowed)).toBe(true);

    // And nothing was written, so the table can't be filled with junk either.
    const rows = await prisma.rateLimitWindow.findMany({
      where: { key: { startsWith: "test:no-ip" } },
    });
    expect(rows).toHaveLength(0);
  });

  it("still limits normally once there is a real IP", async () => {
    const ip = `198.51.100.${Math.floor(Math.random() * 250) + 1}-${nanoid(6)}`;
    usedKeys.push(`test:with-ip:${ip}`);

    for (let i = 0; i < rule.limit; i++) {
      expect((await rateLimitByIp(ip, "test:with-ip", rule, at(0))).allowed).toBe(true);
    }
    expect((await rateLimitByIp(ip, "test:with-ip", rule, at(0))).allowed).toBe(false);
  });

  it("uses limits that are strict for credentials and generous for customers", () => {
    // Pins the intent of the configured numbers so a careless edit is visible.
    expect(RATE_LIMITS.login.limit).toBeLessThanOrEqual(10);
    expect(RATE_LIMITS.passwordResetPerEmail.limit).toBeLessThanOrEqual(5);
    expect(RATE_LIMITS.aiPerHour.limit).toBeLessThanOrEqual(RATE_LIMITS.aiPerDay.limit);
    // A customer clicking accept a few times must never be blocked.
    expect(RATE_LIMITS.publicQuoteAction.limit).toBeGreaterThanOrEqual(10);
  });
});
