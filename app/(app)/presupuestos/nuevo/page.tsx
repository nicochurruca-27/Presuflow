import { requireBusiness } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { canUseAi } from "@/lib/billing/entitlements";
import { QuoteForm } from "@/components/quotes/quote-form";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

export const metadata = { title: "Nuevo presupuesto" };

export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ clienteId?: string; bienvenida?: string }>;
}) {
  const { business } = await requireBusiness();
  const { clienteId, bienvenida } = await searchParams;

  const [customers, aiEnabled] = await Promise.all([
    prisma.customer.findMany({
      where: { businessId: business.id, archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    canUseAi(business.id),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {bienvenida === "1" && (
        <div className="rounded-lg bg-success-light p-4 text-sm text-success">
          ¡Tu negocio está listo! Armá tu primer presupuesto — te lleva menos de un minuto.
        </div>
      )}
      <Card>
        <CardHeader>
          <h1 className="font-semibold text-ink">Nuevo presupuesto</h1>
        </CardHeader>
        <CardBody>
          <QuoteForm
            customers={customers}
            currency={business.currency}
            aiEnabled={aiEnabled}
            defaultCustomerId={clienteId}
          />
        </CardBody>
      </Card>
    </div>
  );
}
