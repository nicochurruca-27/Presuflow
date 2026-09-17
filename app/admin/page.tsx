import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth-helpers";
import { isAdminEmail } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

export const metadata = { title: "Admin" };

export default async function AdminPage() {
  const user = await requireUser();
  if (!isAdminEmail(user.email)) notFound();

  const [userCount, businessCount, quoteCount, acceptedCount, plans, recentBusinesses, recentEvents] =
    await Promise.all([
      prisma.user.count(),
      prisma.business.count(),
      prisma.quote.count(),
      prisma.quote.count({ where: { status: "ACCEPTED" } }),
      prisma.subscription.groupBy({ by: ["plan"], _count: { plan: true } }),
      prisma.business.findMany({
        take: 10,
        orderBy: { createdAt: "desc" },
        include: { owner: true, _count: { select: { quotes: true, customers: true } } },
      }),
      prisma.productEvent.findMany({ take: 20, orderBy: { createdAt: "desc" } }),
    ]);

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <h1 className="text-xl font-semibold text-ink">Panel de administración</h1>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Usuarios" value={String(userCount)} />
        <StatCard label="Negocios" value={String(businessCount)} />
        <StatCard label="Presupuestos" value={String(quoteCount)} />
        <StatCard label="Aceptados" value={String(acceptedCount)} />
      </div>

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-ink">Suscripciones por plan</h2>
        </CardHeader>
        <CardBody className="flex gap-6 text-sm">
          {plans.map((p) => (
            <div key={p.plan}>
              <p className="text-2xl font-semibold text-ink">{p._count.plan}</p>
              <p className="text-muted">{p.plan}</p>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-ink">Negocios recientes</h2>
        </CardHeader>
        <CardBody className="divide-y divide-border p-0">
          {recentBusinesses.map((b) => (
            <div key={b.id} className="flex items-center justify-between p-4 text-sm">
              <div>
                <p className="font-medium text-ink">{b.name}</p>
                <p className="text-muted">{b.owner.email}</p>
              </div>
              <p className="text-muted">
                {b._count.quotes} presupuestos · {b._count.customers} clientes
              </p>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-ink">Actividad reciente</h2>
        </CardHeader>
        <CardBody className="divide-y divide-border p-0">
          {recentEvents.map((e) => (
            <div key={e.id} className="flex items-center justify-between p-3 text-sm">
              <span className="text-ink">{e.name}</span>
              <span className="text-muted">{e.createdAt.toLocaleString("es-AR")}</span>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
