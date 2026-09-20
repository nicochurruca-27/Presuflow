import { z } from "zod";
import { LIMITS, optionalText } from "@/lib/validation/limits";

export const customerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Ingresá el nombre del cliente")
    .max(LIMITS.personName, "El nombre es demasiado largo"),
  phone: optionalText(LIMITS.phone, "El teléfono es demasiado largo"),
  email: z
    .string()
    .trim()
    .max(LIMITS.email, "El email es demasiado largo")
    .email("Email inválido")
    .optional()
    .or(z.literal("")),
  address: optionalText(LIMITS.address, "La dirección es demasiado larga"),
  notes: optionalText(LIMITS.notes, "Las notas son demasiado largas"),
});

export type CustomerInput = z.infer<typeof customerSchema>;
