import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/money";
import { recordQuoteView } from "@/lib/track-quote-view";
import { acceptQuoteAction, rejectQuoteAction } from "@/lib/actions/public-quote";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const quote = await prisma.quote.findUnique({
    where: { publicToken: token },
    include: { business: true },
  });
  if (!quote) return { title: "Presupuesto no encontrado" };
  return {
    title: `Presupuesto #${quote.number} · ${quote.business.name}`,
    robots: { index: false, follow: false },
  };
}

export default async function PublicQuotePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const quote = await prisma.quote.findUnique({
    where: { publicToken: token },
    include: {
      business: true,
      customer: true,
      items: { orderBy: { position: "asc" } },
    },
  });

  if (!quote || quote.status === "DRAFT") notFound();

  const headerList = await headers();
  await recordQuoteView(quote, headerList.get("user-agent"));

  // Re-read after a possible SENT -> VIEWED transition so the UI reflects the current state.
  const current = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });

  const isOpen = current.status === "SENT" || current.status === "VIEWED";
  const acceptWithToken = acceptQuoteAction.bind(null, token);
  const rejectWithToken = rejectQuoteAction.bind(null, token);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-xl">
        <div className="mb-6 text-center">
          {quote.business.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={quote.business.logoUrl}
              alt={quote.business.name}
              className="mx-auto mb-2 h-14 w-14 rounded-full object-cover"
            />
          ) : null}
          <h1 className="text-lg font-semibold text-ink">{quote.business.name}</h1>
          {quote.business.activity && <p className="text-sm text-muted">{quote.business.activity}</p>}
        </div>

        <div className="rounded-xl border border-border bg-surface shadow-sm">
          <div className="border-b border-border p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink">Presupuesto #{quote.number}</h2>
              <StatusPill status={current.status} />
            </div>
            <p className="mt-1 text-sm text-muted">Para: {quote.customer.name}</p>
            <p className="text-sm text-muted">
              Fecha: {quote.createdAt.toLocaleDateString("es-AR")}
              {quote.validUntil && ` · Válido hasta ${quote.validUntil.toLocaleDateString("es-AR")}`}
            </p>
          </div>

          <div className="space-y-3 p-5">
            {quote.items.map((item) => (
              <div key={item.id} className="flex justify-between text-sm">
                <div>
                  <p className="text-ink">{item.description}</p>
                  {item.detail && <p className="text-muted">{item.detail}</p>}
                  <p className="text-muted">
                    {Number(item.quantity)} × {formatMoney(item.unitPrice, quote.currency)}
                  </p>
                </div>
                <p className="font-medium text-ink">{formatMoney(item.total, quote.currency)}</p>
              </div>
            ))}

            <div className="border-t border-border pt-3 text-sm">
              <div className="flex justify-between text-muted">
                <span>Subtotal</span>
                <span>{formatMoney(quote.subtotal, quote.currency)}</span>
              </div>
              {quote.discount > 0 && (
                <div className="flex justify-between text-muted">
                  <span>Descuento</span>
                  <span>-{formatMoney(quote.discount, quote.currency)}</span>
                </div>
              )}
              <div className="mt-1 flex justify-between text-lg font-bold text-ink">
                <span>Total</span>
                <span>{formatMoney(quote.total, quote.currency)}</span>
              </div>
            </div>

            {quote.conditions && (
              <div className="border-t border-border pt-3 text-sm">
                <p className="font-medium text-ink">Condiciones</p>
                <p className="text-muted">{quote.conditions}</p>
              </div>
            )}
            {quote.notes && (
              <div className="border-t border-border pt-3 text-sm">
                <p className="font-medium text-ink">Notas</p>
                <p className="text-muted">{quote.notes}</p>
              </div>
            )}
          </div>

          <div className="space-y-3 border-t border-border p-5">
            {isOpen && (
              <>
                <form action={acceptWithToken}>
                  <button
                    type="submit"
                    className="w-full rounded-lg bg-success px-4 py-3 font-semibold text-white hover:bg-green-700"
                  >
                    Aceptar presupuesto
                  </button>
                </form>
                <form action={rejectWithToken}>
                  <button
                    type="submit"
                    className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-muted hover:bg-slate-50"
                  >
                    Rechazar
                  </button>
                </form>
              </>
            )}
            {current.status === "ACCEPTED" && (
              <p className="text-center text-sm font-medium text-success">
                ✓ Aceptaste este presupuesto.
              </p>
            )}
            {current.status === "REJECTED" && (
              <p className="text-center text-sm text-muted">Rechazaste este presupuesto.</p>
            )}
            {quote.business.phone && (
              <a
                href={buildWhatsAppUrl(
                  quote.business.phone,
                  `Hola, tengo una consulta sobre el presupuesto #${quote.number}.`
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center text-sm text-brand hover:underline"
              >
                Hacer una consulta
              </a>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-muted">Generado con PresuFlow</p>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    SENT: "bg-brand-light text-brand-dark",
    VIEWED: "bg-warning-light text-warning",
    ACCEPTED: "bg-success-light text-success",
    REJECTED: "bg-danger-light text-danger",
    EXPIRED: "bg-slate-100 text-muted",
    CANCELLED: "bg-slate-100 text-muted",
  };
  const label: Record<string, string> = {
    SENT: "Pendiente",
    VIEWED: "Pendiente",
    ACCEPTED: "Aceptado",
    REJECTED: "Rechazado",
    EXPIRED: "Vencido",
    CANCELLED: "Cancelado",
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${map[status] ?? ""}`}>
      {label[status] ?? status}
    </span>
  );
}
