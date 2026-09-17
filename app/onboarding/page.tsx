import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { OnboardingForm } from "@/components/onboarding-form";

export const metadata = { title: "Creemos tu primer presupuesto" };

export default async function OnboardingPage() {
  const user = await requireUser();
  const existing = await prisma.business.findUnique({ where: { ownerId: user.id } });
  if (existing) redirect("/dashboard");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-ink">Creemos tu primer presupuesto</h1>
          <p className="mt-1 text-sm text-muted">
            Contanos un poco de tu negocio para personalizar tus presupuestos.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <OnboardingForm />
        </div>
      </div>
    </div>
  );
}
