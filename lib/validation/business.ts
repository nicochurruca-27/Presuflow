import { z } from "zod";
import { LIMITS, boundedText, optionalText } from "@/lib/validation/limits";

export const CURRENCIES = ["ARS", "USD", "EUR", "MXN", "CLP", "COP", "UYU"] as const;

export const ACTIVITIES = [
  "Electricista",
  "Plomero",
  "Técnico de aire acondicionado",
  "Pintor",
  "Instalador",
  "Técnico / reparador",
  "Mantenimiento",
  "Contratista",
  "Freelancer / otro servicio",
] as const;

export const onboardingSchema = z.object({
  businessName: z
    .string()
    .trim()
    .min(2, "Ingresá el nombre de tu negocio")
    .max(LIMITS.businessName, "El nombre del negocio es demasiado largo"),
  /**
   * The form offers ACTIVITIES in a select, but the value stays free text on
   * the server: the list is a convenience, not a taxonomy, and locking it
   * down would break the moment someone's trade isn't on it. Bounded instead.
   */
  activity: boundedText(LIMITS.activity, "Elegí tu actividad", "La actividad es demasiado larga"),
  phone: optionalText(LIMITS.phone, "El teléfono es demasiado largo"),
  currency: z.enum(CURRENCIES).default("ARS"),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;
