import { requireBusiness } from "@/lib/auth-helpers";
import { getBusinessPlan, PLAN_LIMITS } from "@/lib/billing/entitlements";
import { BusinessSettingsForm } from "@/components/business-settings-form";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

export const metadata = { title: "Configuración" };

export default async function SettingsPage() {
  const { business } = await requireBusiness();
  const plan = await getBusinessPlan(business.id);
  const limits = PLAN_LIMITS[plan];

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-xl font-semibold text-ink">Configuración</h1>

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-ink">Tu negocio</h2>
        </CardHeader>
        <CardBody>
          <BusinessSettingsForm business={business} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-ink">Tu plan</h2>
        </CardHeader>
        <CardBody className="space-y-2 text-sm">
          <p className="text-lg font-semibold text-ink">{limits.label}</p>
          <ul className="list-inside list-disc text-muted">
            <li>
              {limits.maxQuotesPerMonth
                ? `Hasta ${limits.maxQuotesPerMonth} presupuestos por mes`
                : "Presupuestos ilimitados"}
            </li>
            <li>{limits.ai ? "Creación con IA incluida" : "Creación con IA no incluida"}</li>
          </ul>
          {plan === "FREE" && (
            <p className="pt-2 text-sm text-muted">
              Los planes pagos (Starter y Pro) se activan próximamente. Escribinos si querés más
              presupuestos o IA desde ya.
            </p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
