import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBusiness } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { updateCustomerAction } from "@/lib/actions/customers";
import { CustomerForm } from "@/components/customer-form";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { business } = await requireBusiness();

  const customer = await prisma.customer.findFirst({
    where: { id, businessId: business.id },
    include: { quotes: { orderBy: { createdAt: "desc" }, where: { deletedAt: null } } },
  });
  if (!customer) notFound();

  const boundUpdate = updateCustomerAction.bind(null, customer.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">{customer.name}</h1>
        <Link href={`/presupuestos/nuevo?clienteId=${customer.id}`}>
          <Button>+ Nuevo presupuesto</Button>
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-ink">Datos del cliente</h2>
          </CardHeader>
          <CardBody>
            <CustomerForm action={boundUpdate} customer={customer} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-ink">Historial de presupuestos</h2>
          </CardHeader>
          <CardBody className="divide-y divide-border p-0">
            {customer.quotes.length === 0 && (
              <p className="p-5 text-sm text-muted">Todavía no hay presupuestos para este cliente.</p>
            )}
            {customer.quotes.map((quote) => (
              <Link
                key={quote.id}
                href={`/presupuestos/${quote.id}`}
                className="flex items-center justify-between p-4 hover:bg-slate-50"
              >
                <div>
                  <p className="font-medium text-ink">#{quote.number}</p>
                  <p className="text-sm text-muted">{formatMoney(quote.total, quote.currency)}</p>
                </div>
                <StatusBadge status={quote.status} />
              </Link>
            ))}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
