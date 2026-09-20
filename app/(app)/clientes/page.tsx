import Link from "next/link";
import { requireBusiness } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { LIMITS } from "@/lib/validation/limits";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";

export const metadata = { title: "Clientes" };

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { business } = await requireBusiness();
  const { q: rawQuery } = await searchParams;
  // Bounded before it becomes a LIKE pattern: the box is for a name, and an
  // arbitrarily long query string shouldn't turn into an arbitrarily long
  // database scan.
  const q = rawQuery?.trim().slice(0, LIMITS.searchQuery) || undefined;

  const customers = await prisma.customer.findMany({
    where: {
      businessId: business.id,
      archivedAt: null,
      ...(q
        ? {
            name: { contains: q, mode: "insensitive" },
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { quotes: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">Clientes</h1>
        <Link href="/clientes/nuevo">
          <Button>+ Nuevo cliente</Button>
        </Link>
      </div>

      <form className="max-w-sm">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Buscar cliente..."
          className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
      </form>

      <Card>
        <CardBody className="divide-y divide-border p-0">
          {customers.length === 0 && (
            <p className="p-6 text-sm text-muted">
              Todavía no tenés clientes. Creá el primero para armar tu próximo presupuesto.
            </p>
          )}
          {customers.map((customer) => (
            <Link
              key={customer.id}
              href={`/clientes/${customer.id}`}
              className="flex items-center justify-between p-4 hover:bg-slate-50"
            >
              <div>
                <p className="font-medium text-ink">{customer.name}</p>
                <p className="text-sm text-muted">{customer.phone || customer.email || "—"}</p>
              </div>
              <span className="text-sm text-muted">{customer._count.quotes} presupuestos</span>
            </Link>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
