import { z } from "zod";
import {
  LIMITS,
  boundedText,
  decimalPlaces,
  optionalDateString,
  optionalText,
} from "@/lib/validation/limits";

/**
 * Quantities are stored as `Decimal(10,2)`. Anything with more precision
 * would be rounded by Postgres on the way in — silently changing a number
 * the user typed — so it's refused here instead.
 */
const quantity = z.coerce
  .number()
  .positive("La cantidad debe ser mayor a 0")
  .max(LIMITS.maxQuantity, `La cantidad no puede superar ${LIMITS.maxQuantity}`)
  .refine(
    (value) => decimalPlaces(value) <= LIMITS.quantityDecimals,
    `La cantidad admite hasta ${LIMITS.quantityDecimals} decimales`
  );

/**
 * Prices are whole currency units (`QuoteItem.unitPrice` is an `Int`), which
 * is what the form's `step="1"` already produces. Requiring the integer here
 * means a price with cents is rejected with a message instead of being
 * rounded behind the user's back.
 */
const unitPrice = z.coerce
  .number()
  .int("El precio debe ser un número entero")
  .min(0, "El precio no puede ser negativo")
  .max(LIMITS.maxUnitPrice, "El precio es demasiado alto");

export const quoteItemSchema = z.object({
  description: boundedText(
    LIMITS.itemDescription,
    "Describí el servicio o producto",
    "La descripción del ítem es demasiado larga"
  ),
  detail: optionalText(LIMITS.itemDetail, "El detalle del ítem es demasiado largo"),
  quantity: quantity.default(1),
  unitPrice,
});

export const quoteSchema = z
  .object({
    customerId: z
      .string()
      .trim()
      .min(1, "Elegí un cliente")
      .max(LIMITS.id, "Elegí un cliente válido"),
    items: z
      .array(quoteItemSchema)
      .min(1, "Agregá al menos un ítem")
      .max(LIMITS.maxItemsPerQuote, `Un presupuesto admite hasta ${LIMITS.maxItemsPerQuote} ítems`),
    discount: z.coerce
      .number()
      .int("El descuento debe ser un número entero")
      .min(0, "El descuento no puede ser negativo")
      .max(LIMITS.maxMoney, "El descuento es demasiado alto")
      .default(0),
    notes: optionalText(LIMITS.notes, "Las notas son demasiado largas"),
    conditions: optionalText(LIMITS.conditions, "Las condiciones son demasiado largas"),
    validUntil: optionalDateString("Válido hasta"),
    workDate: optionalDateString("Fecha del trabajo"),
  })
  .superRefine((value, ctx) => {
    // Each field is within its own bound by now, but their product isn't:
    // 10.000 x 100.000.000 overflows the Int columns the totals live in.
    // Checked here, where items and discount are visible together.
    let subtotal = 0;
    for (const item of value.items) {
      subtotal += Math.round(item.quantity * item.unitPrice);
    }

    if (subtotal > LIMITS.maxMoney) {
      ctx.addIssue({
        code: "custom",
        path: ["items"],
        message: "El total del presupuesto es demasiado alto",
      });
      return;
    }

    // Rejected rather than clamped: quietly shrinking a discount someone
    // typed would show them a total they never asked for.
    if (value.discount > subtotal) {
      ctx.addIssue({
        code: "custom",
        path: ["discount"],
        message: "El descuento no puede ser mayor al subtotal",
      });
    }
  });

export type QuoteItemInput = z.infer<typeof quoteItemSchema>;
export type QuoteInput = z.infer<typeof quoteSchema>;

/**
 * Server-side source of truth for money math. Never trust client-computed
 * totals: the form recomputes these for display, but nothing it sends is
 * read back — only description, detail, quantity and unitPrice are.
 *
 * The discount clamp stays as a second line of defence. `quoteSchema` now
 * rejects a discount above the subtotal outright, so in the normal path the
 * clamp never fires; it's here so that no caller can produce a negative
 * total by skipping validation.
 */
export function computeQuoteTotals(items: QuoteItemInput[], discount: number) {
  const subtotal = items.reduce(
    (sum, item) => sum + Math.round(item.quantity * item.unitPrice),
    0
  );
  const safeDiscount = Math.min(discount, subtotal);
  const total = subtotal - safeDiscount;
  return { subtotal, discount: safeDiscount, total };
}

export const aiDraftSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(5, "Contanos qué trabajo vas a presupuestar")
    .max(LIMITS.aiPrompt, "El pedido es demasiado largo. Resumilo un poco."),
});

/**
 * Free text sent to the AI provider. Capped because the payload size drives
 * the cost of the call, and nothing in the product needs a description
 * longer than this.
 */
export const aiTextSchema = z
  .string()
  .trim()
  .min(1, "Escribí una descripción primero.")
  .max(LIMITS.aiText, "El texto es demasiado largo para mejorarlo con IA.");

export const followUpSchema = z.object({
  quoteId: z.string().trim().min(1).max(LIMITS.id),
  message: boundedText(
    LIMITS.followUpMessage,
    "Escribí un mensaje antes de registrar el seguimiento.",
    "El mensaje es demasiado largo."
  ),
});
