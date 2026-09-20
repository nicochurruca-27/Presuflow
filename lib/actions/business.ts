"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { onboardingSchema } from "@/lib/validation/business";
import { requireUser } from "@/lib/auth-helpers";
import { track } from "@/lib/analytics";
import { runSideEffect } from "@/lib/side-effects";
import type { ActionState } from "@/lib/actions/auth";

export async function completeOnboardingAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireUser();

  const existing = await prisma.business.findUnique({ where: { ownerId: user.id } });
  if (existing) redirect("/dashboard");

  const parsed = onboardingSchema.safeParse({
    businessName: formData.get("businessName"),
    activity: formData.get("activity"),
    phone: formData.get("phone") ?? "",
    currency: formData.get("currency") ?? "ARS",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisá los datos" };
  }

  const business = await prisma.business.create({
    data: {
      ownerId: user.id,
      name: parsed.data.businessName,
      activity: parsed.data.activity,
      phone: parsed.data.phone || null,
      currency: parsed.data.currency,
      settings: { create: {} },
      subscription: { create: { plan: "FREE" } },
    },
  });

  await runSideEffect("onboarding analytics", () =>
    track("onboarding_completed", business.id)
  );
  redirect("/presupuestos/nuevo?bienvenida=1");
}

export async function updateBusinessAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireUser();
  const business = await prisma.business.findUnique({ where: { ownerId: user.id } });
  if (!business) redirect("/onboarding");

  const parsed = onboardingSchema.safeParse({
    businessName: formData.get("businessName"),
    activity: formData.get("activity"),
    phone: formData.get("phone") ?? "",
    currency: formData.get("currency") ?? business.currency,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisá los datos" };
  }

  await prisma.business.update({
    where: { id: business.id },
    data: {
      name: parsed.data.businessName,
      activity: parsed.data.activity,
      phone: parsed.data.phone || null,
      currency: parsed.data.currency,
    },
  });

  return undefined;
}
