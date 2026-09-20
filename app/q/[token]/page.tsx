import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/money";
import { recordQuoteView } from "@/lib/track-quote-view";
import { acceptQuoteAction, rejectQuoteAction } from "@/lib/actions/public-quote";
import { settleExpiration } from "@/lib/quote-lifecycle";
import { OPEN_STATUSES } from "@/lib/quote-service";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { PublicQuoteActions } from "@/components/quotes/public-quote-actions";

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

  // Enforce validUntil before anything else: an overdue SENT/VIEWED quote
  // becomes EXPIRED here so the view-tracking below never flips it to VIEWED
  // instead, and so the buttons below are hidden based on the real status.
  quote.status = await settleExpiration(quote);

  const headerList = await headers();
  await recordQuoteView(quote, headerList.get("user-agent"));

  // Re-read after a possible SENT -> VIEWED transition so the UI reflects the current state.
  const current = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });

  const isOpen = OPEN_STATUSES.includes(current.status);
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
          <h1 className="break-words text-lg font-semibold text-ink">{quote.business.name}</h1>
          {quote.business.activity && (
            <p className="break-words text-sm text-muted">{quote.business.activity}</p>
          )}
        </div>

        <div className="rounded-xl border border-border bg-surface shadow-sm">
          <div className="border-b border-border p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-ink">Presupuesto #{quote.number}</h2>
              <span className="shrink-0">
                <StatusPill status={current.status} />
              </span>
            </div>
            <p className="mt-1 break-words text-sm text-muted">Para: {quote.customer.name}</p>
            <p className="text-sm text-muted">
              Fecha: {quote.createdAt.toLocaleDateString("es-AR")}
              {quote.validUntil && ` · Válido hasta ${quote.validUntil.toLocaleDateString("es-AR")}`}
            </p>
          </div>

          <div className="space-y-3 p-5">
            {quote.items.map((item) => (
              <div key={item.id} className="flex justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="break-words text-ink">{item.description}</p>
                  {item.detail && <p className="break-words text-muted">{item.detail}</p>}
                  <p className="text-muted">
                    {Number(item.quantity)} × {formatMoney(item.unitPrice, quote.currency)}
                  </p>
                </div>
                <p className="shrink-0 font-medium text-ink">
                  {formatMoney(item.total, quote.currency)}
                </p>
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
              <div className="mt-1 flex flex-wrap justify-between gap-x-3 text-lg font-bold text-ink">
                <span>Total</span>
                <span className="break-all">{formatMoney(quote.total, quote.currency)}</span>
              </div>
            </div>

            {quote.conditions && (
              <div className="border-t border-border pt-3 text-sm">
                <p className="font-medium text-ink">Condiciones</p>
                <p className="whitespace-pre-line break-words text-muted">{quote.conditions}</p>
              </div>
            )}
            {quote.notes && (
              <div className="border-t border-border pt-3 text-sm">
                <p className="font-medium text-ink">Notas</p>
                <p className="whitespace-pre-line break-words text-muted">{quote.notes}</p>
              </div>
            )}
          </div>

          <div className="space-y-3 border-t border-border p-5">
            {isOpen && (
              <PublicQuoteActions
                acceptAction={acceptWithToken}
                rejectAction={rejectWithToken}
              />
            )}
            {current.status === "ACCEPTED" && (
              <p className="text-center text-sm font-medium text-success">
                ✓ Aceptaste este presupuesto.
              </p>
            )}
            {current.status === "REJECTED" && (
              <p className="text-center text-sm text-muted">Rechazaste este presupuesto.</p>
            )}
            {current.status === "EXPIRED" && (
              <p className="text-center text-sm text-muted">
                Este presupuesto venció. Pedile al profesional que te envíe uno nuevo.
              </p>
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
