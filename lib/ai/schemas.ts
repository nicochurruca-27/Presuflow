import { z } from "zod";
import { LIMITS, decimalPlaces } from "@/lib/validation/limits";

/**
 * What each AI operation is allowed to hand back.
 *
 * Two deliberate choices run through all of these:
 *
 * 1. **No coercion.** `z.coerce.number()` would turn `""`, `null` and
 *    `"cero"` into 0 — a price nobody quoted, presented to a customer as if
 *    they had. The model sends a number or the response is rejected.
 * 2. **No defaults on anything the user would have to trust.** An absent
 *    `quantity` or `unitPrice` is a malformed response, not an invitation to
 *    pick a value. The only defaults here are for genuinely empty things: an
 *    absent detail is no detail, an absent notes list is no notes.
 *
 * The bounds match the ones the quote form enforces, so a draft that passes
 * here is a draft the user can actually save.
 */

/** null is meaningful: the price is unknown and the person has to fill it in. */
const draftedUnitPrice = z
  .number()
  .int()
  .min(0)
  .max(LIMITS.maxUnitPrice)
  .nullable();

const draftedQuantity = z
  .number()
  .positive()
  .max(LIMITS.maxQuantity)
  .refine((value) => decimalPlaces(value) <= LIMITS.quantityDecimals);

export const draftQuoteResponseSchema = z.object({
  items: z
    .array(
      z.object({
        description: z.string().trim().min(1).max(LIMITS.itemDescription),
        detail: z.string().trim().max(LIMITS.itemDetail).default(""),
        quantity: draftedQuantity,
        unitPrice: draftedUnitPrice,
      })
    )
    .min(1)
    .max(LIMITS.aiMaxItems),
  missingInfo: z
    .array(z.string().trim().min(1).max(LIMITS.itemDescription))
    .max(LIMITS.aiMissingInfoNotes)
    .default([]),
});

export type DraftQuoteResponse = z.infer<typeof draftQuoteResponseSchema>;

/**
 * The plain-text operations. They're validated too: the text lands in a
 * field with its own limit, so a reply longer than that column allows has to
 * fail here rather than after the user clicks save.
 */
export const improvedDescriptionSchema = z
  .string()
  .trim()
  .min(1)
  .max(LIMITS.itemDescription);

export const generatedConditionsSchema = z.string().trim().min(1).max(LIMITS.conditions);

export const followUpMessageSchema = z.string().trim().min(1).max(LIMITS.followUpMessage);
