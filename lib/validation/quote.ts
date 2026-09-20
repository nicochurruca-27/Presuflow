import { z } from "zod";

export const quoteItemSchema = z.object({
  description: z.string().trim().min(1, "Describí el servicio o producto"),
  detail: z.string().trim().optional().or(z.literal("")),
  quantity: z.coerce.number().positive("La cantidad debe ser mayor a 0").default(1),
  unitPrice: z.coerce.number().min(0, "El precio no puede ser negativo"),
});

export const quoteSchema = z.object({
  customerId: z.string().min(1, "Elegí un cliente"),
  items: z.array(quoteItemSchema).min(1, "Agregá al menos un ítem"),
  discount: z.coerce.number().min(0, "El descuento no puede ser negativo").default(0),
  notes: z.string().trim().optional().or(z.literal("")),
  conditions: z.string().trim().optional().or(z.literal("")),
  validUntil: z.string().optional().or(z.literal("")),
  workDate: z.string().optional().or(z.literal("")),
});

export type QuoteItemInput = z.infer<typeof quoteItemSchema>;
export type QuoteInput = z.infer<typeof quoteSchema>;

/** Server-side source of truth for money math. Never trust client-computed totals. */
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
  prompt: z.string().trim().min(5, "Contanos qué trabajo vas a presupuestar").max(1000),
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
  .max(2000, "El texto es demasiado largo para mejorarlo con IA.");

export const followUpSchema = z.object({
  quoteId: z.string().min(1),
});
