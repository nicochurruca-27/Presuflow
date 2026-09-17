import Link from "next/link";
import { requireBusiness } from "@/lib/auth-helpers";
import { getDashboardData } from "@/lib/dashboard";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

export const metadata = { title: "Panel" };

export default async function DashboardPage() {
  const { business } = await requireBusiness();
  const data = await getDashboardData(business.id);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Hola, {business.name}</h1>
          <p className="text-sm text-muted">Así está tu actividad con presupuestos.</p>
        </div>
        <Link href="/presupuestos/nuevo" className="hidden md:block">
          <Button size="lg">+ Nuevo presupuesto</Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Creados" value={String(data.counts.created)} />
        <StatCard label="Enviados" value={String(data.counts.sent)} />
        <StatCard label="Aceptados" value={String(data.counts.accepted)} />
        <StatCard label="Pendientes" value={String(data.counts.pending)} />
        <StatCard
          label="Presupuestado"
          value={formatMoney(data.totalQuoted, business.currency)}
        />
        <StatCard label="Aceptado" value={formatMoney(data.totalAccepted, business.currency)} />
      </div>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <h2 className="font-semibold text-ink">Requieren seguimiento</h2>
          <span className="text-xs text-muted">Enviados hace 3+ días sin respuesta</span>
        </CardHeader>
        <CardBody className="divide-y divide-border p-0">
          {data.needingFollowUp.length === 0 && (
            <p className="p-5 text-sm text-muted">
              Por ahora no hay presupuestos pendientes de seguimiento. 🎉
            </p>
          )}
          {data.needingFollowUp.map((q) => (
            <div
              key={q.id}
              className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium text-ink">
                  {q.customerName} — Presupuesto #{q.number}
                </p>
                <p className="text-sm text-muted">
                  {formatMoney(q.total, q.currency)} · Enviado hace {q.daysSinceSent} días
                </p>
              </div>
              <div className="flex gap-2">
                <Link href={`/presupuestos/${q.id}`}>
                  <Button variant="outline" size="sm">
                    Ver
                  </Button>
                </Link>
                <Link href={`/presupuestos/${q.id}#seguimiento`}>
                  <Button size="sm">Seguimiento</Button>
                </Link>
              </div>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
