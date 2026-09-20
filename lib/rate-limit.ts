import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/log";

/**
 * Fixed-window rate limiting backed by Postgres.
 *
 * Why not an in-process Map: the app runs on Vercel, where each request can
 * land on a different serverless instance with its own memory. A Map would
 * throttle one instance while an attacker's traffic spreads across the
 * others — it would look like protection without being any. Postgres is the
 * only shared state this project already has, so the counters live there
 * and every instance sees the same numbers.
 *
 * What this gives you, precisely:
 * - Counters are shared across instances and incremented atomically
 *   (`UPDATE ... count = count + 1`), so concurrent requests can't both
 *   read the same pre-increment value.
 * - Windows are fixed, not sliding. Someone can therefore send up to 2x the
 *   limit across a window boundary (the tail of one window plus the head of
 *   the next). That's an accepted trade-off: it's a fraction of the cost of
 *   the sliding-window bookkeeping, and still bounds sustained abuse.
 * - Every check costs one database round-trip. Fine at this scale; if the
 *   app ever needs per-request latency below that, this is the piece to move
 *   to Redis/Upstash.
 */

export interface RateLimitRule {
  /** Maximum allowed attempts within one window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Attempts used in the current window, including this one. */
  used: number;
  remaining: number;
  /** When the current window resets. */
  resetAt: Date;
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/**
 * Concrete limits, kept together so they're reviewable in one place rather
 * than scattered as magic numbers across actions.
 */
export const RATE_LIMITS = {
  /** Brute force against one account. */
  login: { limit: 8, windowMs: 15 * MINUTE },
  /** Password-spraying many accounts from one source. */
  loginPerIp: { limit: 30, windowMs: 15 * MINUTE },
  /** Reset-email bombing a specific person. */
  passwordResetPerEmail: { limit: 3, windowMs: HOUR },
  passwordResetPerIp: { limit: 10, windowMs: HOUR },
  /** Mass account creation. */
  signupPerIp: { limit: 5, windowMs: HOUR },
  /**
   * Public accept/reject. Deliberately generous: the transition itself is
   * atomic and idempotent, so this only exists to stop someone hammering
   * the endpoint — it must not get in the way of a customer clicking twice.
   */
  publicQuoteAction: { limit: 20, windowMs: HOUR },
  /**
   * AI calls cost real money per request, so these are per business and
   * tighter. Two layers: a burst limit and a daily ceiling.
   */
  aiPerHour: { limit: 20, windowMs: HOUR },
  aiPerDay: { limit: 100, windowMs: 24 * HOUR },
} as const satisfies Record<string, RateLimitRule>;

function windowStartFor(now: Date, windowMs: number): Date {
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

/**
 * Records an attempt against `key` and reports whether it's within the rule.
 *
 * `now` is injectable so tests can move through windows without sleeping.
 */
export async function checkRateLimit(
  key: string,
  rule: RateLimitRule,
  now: Date = new Date()
): Promise<RateLimitResult> {
  const windowStart = windowStartFor(now, rule.windowMs);
  const resetAt = new Date(windowStart.getTime() + rule.windowMs);

  let used: number;
  try {
    const row = await prisma.rateLimitWindow.upsert({
      where: { key_windowStart: { key, windowStart } },
      create: { key, windowStart, count: 1 },
      update: { count: { increment: 1 } },
    });
    used = row.count;
  } catch (err) {
    // Two requests racing to create the same window row: one wins the
    // insert, the loser gets a unique-constraint error and just increments.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const row = await prisma.rateLimitWindow.update({
        where: { key_windowStart: { key, windowStart } },
        data: { count: { increment: 1 } },
      });
      used = row.count;
    } else {
      throw err;
    }
  }

  return {
    allowed: used <= rule.limit,
    used,
    remaining: Math.max(0, rule.limit - used),
    resetAt,
  };
}

/**
 * Per-IP limiting, skipped when the address couldn't be determined.
 *
 * Without this, every request lacking `x-forwarded-for` would share a
 * single "unknown" counter and legitimate users would lock each other out —
 * a self-inflicted outage far worse than the abuse being prevented. Behind
 * Vercel the header is always set by the platform and can't be stripped by
 * the client, so in the real deployment this never opens a hole; the
 * per-account limits (keyed by email or business) apply regardless.
 */
export async function rateLimitByIp(
  ip: string,
  keyPrefix: string,
  rule: RateLimitRule,
  now: Date = new Date()
): Promise<RateLimitResult> {
  if (!ip || ip === "unknown") {
    return { allowed: true, used: 0, remaining: rule.limit, resetAt: now };
  }
  return rateLimit(`${keyPrefix}:${ip}`, rule, now);
}

/**
 * Deletes counters whose window is long gone. There's no cron in this
 * project yet, so it's called opportunistically from the limiter itself on
 * a small fraction of requests — enough to keep the table from growing
 * without adding a round-trip to every check.
 */
export async function pruneRateLimitWindows(olderThan: Date): Promise<number> {
  const { count } = await prisma.rateLimitWindow.deleteMany({
    where: { windowStart: { lt: olderThan } },
  });
  return count;
}

const PRUNE_PROBABILITY = 0.02;

/** checkRateLimit plus the occasional cleanup. Use this from application code. */
export async function rateLimit(
  key: string,
  rule: RateLimitRule,
  now: Date = new Date()
): Promise<RateLimitResult> {
  const result = await checkRateLimit(key, rule, now);

  if (Math.random() < PRUNE_PROBABILITY) {
    const cutoff = new Date(now.getTime() - 24 * HOUR);
    // Best effort: failing to prune must never fail the request.
    void pruneRateLimitWindows(cutoff).catch((err) => logError("rate-limit", err));
  }

  return result;
}
