import { z } from "zod";

/**
 * Every bound the application enforces on user-supplied data, in one place.
 *
 * They live here rather than inline in each schema so that a limit can be
 * reviewed against the database column it protects. Two kinds of bound are
 * mixed on purpose and both matter:
 *
 * - Product bounds (how long a note may reasonably be). Picking these is a
 *   judgement call; they're generous enough that a real user never hits one.
 * - Storage bounds (what Postgres can actually hold). These are not
 *   negotiable: `QuoteItem.quantity` is `Decimal(10,2)` and every money
 *   column is a 4-byte `Int`, so a value past the limit is a failed write
 *   and a 500, not a large quote.
 */
export const LIMITS = {
  // --- Text ---
  personName: 100,
  businessName: 120,
  activity: 100,
  phone: 40,
  /** The maximum length of an email address per RFC 5321. */
  email: 254,
  address: 250,
  notes: 2000,
  conditions: 4000,
  itemDescription: 300,
  itemDetail: 1000,
  followUpMessage: 2000,
  quotePrefix: 20,
  /** Free-text search box. Long enough for any real name, short enough not to be a payload. */
  searchQuery: 100,
  /** Ids we look up. A cuid is 25 characters; this is slack, not a spec. */
  id: 64,

  // --- Passwords ---
  /**
   * bcrypt only reads the first 72 bytes, and hashing is deliberately slow,
   * so an unbounded password field is a CPU denial-of-service vector.
   */
  newPassword: 200,
  /**
   * Login is bounded far more loosely, purely as that DoS guard: rejecting a
   * long password here would lock out an account created before this limit
   * existed, and refusing to let someone log in is worse than the input
   * being oversized.
   */
  loginPassword: 1024,

  // --- Quotes ---
  maxItemsPerQuote: 50,
  /**
   * `Decimal(10,2)`: at most 8 digits before the point and 2 after. The
   * product limit is far below the column's ceiling.
   */
  maxQuantity: 10_000,
  quantityDecimals: 2,
  /** Whole currency units, and comfortably inside a 4-byte Int. */
  maxUnitPrice: 100_000_000,
  /**
   * Ceiling for any computed money value (item total, subtotal, discount,
   * total). Postgres `Int` tops out at 2_147_483_647; staying under it means
   * an absurd quote is rejected with a message instead of blowing up the
   * insert.
   */
  maxMoney: 2_000_000_000,
  /** How far a validUntil / workDate may sit from today, in years, either way. */
  dateRangeYears: 10,

  // --- AI ---
  aiPrompt: 1000,
  aiText: 2000,
  /**
   * Hard ceiling on the characters handed to the provider in one call
   * (system + user). Every field already has its own limit, but the combined
   * payload is what actually drives cost, so it's checked once at the edge.
   */
  aiContextChars: 8000,
  /** Most items we'll accept back from a draft. */
  aiMaxItems: 30,
  aiMissingInfoNotes: 20,
} as const;

/**
 * A required, trimmed string with a floor and a ceiling.
 *
 * Note the order: trim first, then measure. Otherwise trailing whitespace
 * counts against the user's limit.
 */
export function boundedText(max: number, minMessage: string, maxMessage: string) {
  return z.string().trim().min(1, minMessage).max(max, maxMessage);
}

/**
 * An optional trimmed string. The empty string is a legitimate value here —
 * it's what an untouched form field submits — and it means "not provided".
 */
export function optionalText(max: number, maxMessage: string) {
  return z.string().trim().max(max, maxMessage).optional().or(z.literal(""));
}

/**
 * A date arriving as a string from a form, where empty means "not set".
 *
 * `new Date("cualquier cosa")` yields an Invalid Date that only fails later,
 * at the database, as a 500. This rejects it up front, and also refuses
 * dates so far away they can only be a typo or an attack.
 *
 * Written as one schema with a superRefine rather than a union with
 * `z.literal("")` so the message the user sees is the one about their date,
 * not a generic union failure.
 */
export function optionalDateString(fieldLabel: string) {
  return z
    .string()
    .trim()
    // Nothing legitimate is longer; this also keeps Date.parse off a payload.
    .max(40, `${fieldLabel}: la fecha no es válida`)
    .superRefine((value, ctx) => {
      if (value === "") return;

      const parsed = Date.parse(value);
      if (!Number.isFinite(parsed)) {
        ctx.addIssue({ code: "custom", message: `${fieldLabel}: la fecha no es válida` });
        return;
      }

      const span = LIMITS.dateRangeYears * 365.25 * 24 * 60 * 60 * 1000;
      const now = Date.now();
      if (parsed < now - span || parsed > now + span) {
        ctx.addIssue({
          code: "custom",
          message: `${fieldLabel}: la fecha está fuera de un rango razonable`,
        });
      }
    })
    .optional();
}

/**
 * Turns a validated date string into a Date, or null.
 *
 * Belt and braces with the schema above: nothing that isn't a real date can
 * reach a Prisma write even if some future caller forgets to validate first.
 */
export function toDateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed) : null;
}

/** Counts decimal places without going through a float. */
export function decimalPlaces(value: number): number {
  const text = String(value);
  if (text.includes("e") || text.includes("E")) return Infinity;
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : text.length - dot - 1;
}
