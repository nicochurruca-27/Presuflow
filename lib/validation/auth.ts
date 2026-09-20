import { z } from "zod";
import { LIMITS } from "@/lib/validation/limits";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(LIMITS.email, "El email es demasiado largo")
  .email("Ingresá un email válido");

export const loginSchema = z.object({
  email,
  password: z
    .string()
    .min(1, "Ingresá tu contraseña")
    // Not a policy, a guard: see LIMITS.loginPassword.
    .max(LIMITS.loginPassword, "La contraseña es demasiado larga"),
});

export const signupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Ingresá tu nombre")
    .max(LIMITS.personName, "El nombre es demasiado largo"),
  email,
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres")
    .max(LIMITS.newPassword, "La contraseña es demasiado larga"),
});

/** Used when setting a new password from a reset link. */
export const newPasswordSchema = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres")
  .max(LIMITS.newPassword, "La contraseña es demasiado larga");

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
