"use server";

import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { prisma } from "@/lib/prisma";
import { getAppUrl } from "@/lib/env";
import { loginSchema, signupSchema } from "@/lib/validation/auth";
import { signIn, signOut } from "@/auth";
import { sendEmail } from "@/lib/email/send";
import { passwordResetEmail, welcomeEmail } from "@/lib/email/templates";
import { track } from "@/lib/analytics";
import { runSideEffect } from "@/lib/side-effects";

export type ActionState = { error?: string } | undefined;

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "Email o contraseña incorrectos" };
    }
    throw err;
  }

  redirect("/dashboard");
}

export async function signupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) {
    return { error: "Ya existe una cuenta con ese email. Iniciá sesión." };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash,
    },
  });

  // The account exists from here on. A failed welcome email or analytics
  // call must never make the person think the signup didn't work.
  await runSideEffect("signup analytics", () => track("signup", null, { userId: user.id }));
  await runSideEffect("welcome email", () => {
    const email = welcomeEmail(user.name);
    return sendEmail({ to: user.email, subject: email.subject, html: email.html });
  });

  await signIn("credentials", {
    email: parsed.data.email,
    password: parsed.data.password,
    redirect: false,
  });

  redirect("/onboarding");
}

export async function requestPasswordResetAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email) return { error: "Ingresá tu email" };

  const user = await prisma.user.findUnique({ where: { email } });
  // Always respond the same way, whether or not the account exists, to avoid leaking who has an account.
  if (user) {
    const token = nanoid(48);
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      },
    });
    const resetUrl = `${getAppUrl()}/restablecer/${token}`;
    await runSideEffect("password reset email", () => {
      const resetEmail = passwordResetEmail(resetUrl);
      return sendEmail({ to: user.email, subject: resetEmail.subject, html: resetEmail.html });
    });
  }

  return undefined;
}

export async function resetPasswordAction(
  token: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres" };
  }

  const resetToken = await prisma.passwordResetToken.findUnique({ where: { token } });
  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
    return { error: "El enlace venció o ya fue usado. Solicitá uno nuevo." };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.$transaction([
    prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    }),
  ]);

  redirect("/login?reset=ok");
}

export async function logoutAction() {
  await signOut({ redirectTo: "/" });
}
