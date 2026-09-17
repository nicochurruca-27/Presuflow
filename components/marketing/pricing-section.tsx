import Link from "next/link";
import { PLAN_LIMITS } from "@/lib/billing/entitlements";
import { Button } from "@/components/ui/button";

const ORDER: (keyof typeof PLAN_LIMITS)[] = ["FREE", "STARTER", "PRO"];

export function PricingSection() {
  return (
    <section id="precios" className="mx-auto max-w-6xl px-4 py-20">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-2xl font-bold text-ink sm:text-3xl">Planes simples, sin sorpresas</h2>
        <p className="mt-3 text-muted">Empezá gratis. Subí de plan cuando lo necesites.</p>
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {ORDER.map((planId) => {
          const plan = PLAN_LIMITS[planId];
          const featured = planId === "STARTER";
          return (
            <div
              key={planId}
              className={`rounded-2xl border p-6 ${
                featured ? "border-brand shadow-lg" : "border-border"
              }`}
            >
              {featured && (
                <span className="mb-3 inline-block rounded-full bg-brand-light px-2.5 py-1 text-xs font-semibold text-brand-dark">
                  Más elegido
                </span>
              )}
              <h3 className="text-lg font-semibold text-ink">{plan.label}</h3>
              <p className="mt-1 text-2xl font-bold text-ink">{plan.priceLabel}</p>
              <ul className="mt-4 space-y-2 text-sm text-muted">
                <li>
                  {plan.maxQuotesPerMonth
                    ? `Hasta ${plan.maxQuotesPerMonth} presupuestos por mes`
                    : "Presupuestos ilimitados"}
                </li>
                <li>{plan.ai ? "Creación de presupuestos con IA" : "Creación manual de presupuestos"}</li>
                <li>Página pública para que tu cliente acepte online</li>
                <li>Seguimiento de presupuestos pendientes</li>
                {plan.customBranding && <li>Personalización de marca</li>}
              </ul>
              <Link href="/registro" className="mt-6 block">
                <Button className="w-full" variant={featured ? "primary" : "outline"}>
                  Empezar
                </Button>
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}
