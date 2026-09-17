import { z } from "zod";

export const customerSchema = z.object({
  name: z.string().trim().min(2, "Ingresá el nombre del cliente"),
  phone: z.string().trim().optional().or(z.literal("")),
  email: z
    .string()
    .trim()
    .email("Email inválido")
    .optional()
    .or(z.literal("")),
  address: z.string().trim().optional().or(z.literal("")),
  notes: z.string().trim().optional().or(z.literal("")),
});

export type CustomerInput = z.infer<typeof customerSchema>;
