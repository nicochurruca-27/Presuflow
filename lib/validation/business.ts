import { z } from "zod";

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
  businessName: z.string().trim().min(2, "Ingresá el nombre de tu negocio"),
  activity: z.string().trim().min(1, "Elegí tu actividad"),
  phone: z.string().trim().optional().or(z.literal("")),
  currency: z.enum(CURRENCIES).default("ARS"),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;
