import Link from "next/link";
import { requireBusiness } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { QuoteStatus } from "@prisma/client";
import { QUOTE_STATUS_LABEL } from "@/lib/quote-status";

export const metadata = { title: "Presupuestos" };

const FILTERS: (QuoteStatus | "ALL")[] = [
  "ALL",
  "DRAFT",
  "SENT",
  "VIEWED",
  "ACCEPTED",
  "REJECTED",
];

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { business } = await requireBusiness();
  const { status } = await searchParams;
  const activeFilter = (status as QuoteStatus | undefined) ?? "ALL";

  const quotes = await prisma.quote.findMany({
    where: {
      businessId: business.id,
      deletedAt: null,
      ...(activeFilter !== "ALL" ? { status: activeFilter } : {}),
    },
    include: { customer: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">Presupuestos</h1>
        <Link href="/presupuestos/nuevo" className="hidden md:block">
          <Button>+ Nuevo presupuesto</Button>
        </Link>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={f === "ALL" ? "/presupuestos" : `/presupuestos?status=${f}`}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium ${
              activeFilter === f ? "bg-ink text-white" : "bg-slate-100 text-muted hover:bg-slate-200"
            }`}
          >
            {f === "ALL" ? "Todos" : QUOTE_STATUS_LABEL[f]}
          </Link>
        ))}
      </div>

      <Card>
        <CardBody className="divide-y divide-border p-0">
          {quotes.length === 0 && (
            <p className="p-6 text-sm text-muted">No hay presupuestos en este filtro todavía.</p>
          )}
          {quotes.map((quote) => (
            <Link
              key={quote.id}
              href={`/presupuestos/${quote.id}`}
              className="flex items-center justify-between gap-3 p-4 hover:bg-slate-50"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-ink">
                  #{quote.number} · {quote.customer.name}
                </p>
                <p className="text-sm text-muted">{formatMoney(quote.total, quote.currency)}</p>
              </div>
              <StatusBadge status={quote.status} />
            </Link>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
