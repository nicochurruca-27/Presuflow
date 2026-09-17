import { requireBusiness } from "@/lib/auth-helpers";
import { getDashboardData } from "@/lib/dashboard";
import { formatMoney } from "@/lib/money";
import { StatCard } from "@/components/ui/stat-card";

export const metadata = { title: "Estadísticas" };

export default async function StatsPage() {
  const { business } = await requireBusiness();
  const data = await getDashboardData(business.id);

  const acceptanceRate =
    data.counts.sent > 0 ? Math.round((data.counts.accepted / data.counts.sent) * 100) : 0;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-ink">Estadísticas</h1>

      <div className="rounded-xl border border-brand/30 bg-brand-light p-6 text-center">
        <p className="text-sm font-medium text-brand-dark">Tasa de aceptación</p>
        <p className="mt-1 text-4xl font-bold text-brand-dark">{acceptanceRate}%</p>
        <p className="mt-1 text-sm text-brand-dark/80">
          {data.counts.accepted} de {data.counts.sent} presupuestos enviados
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Enviados" value={String(data.counts.sent)} />
        <StatCard label="Vistos" value={String(data.counts.viewed)} />
        <StatCard label="Aceptados" value={String(data.counts.accepted)} />
        <StatCard
          label="Importe presupuestado"
          value={formatMoney(data.totalQuoted, business.currency)}
        />
        <StatCard
          label="Importe aceptado"
          value={formatMoney(data.totalAccepted, business.currency)}
        />
      </div>
    </div>
  );
}
