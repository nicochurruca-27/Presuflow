import { notFound } from "next/navigation";
import { requireBusiness } from "@/lib/auth-helpers";
import { getAppUrl } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/money";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { buildQuoteSendMessage, buildFollowUpMessage, firstName } from "@/lib/whatsapp";
import { SendWhatsAppPanel } from "@/components/quotes/send-whatsapp-panel";
import { FollowUpPanel } from "@/components/quotes/follow-up-panel";
import { CopyLinkButton } from "@/components/copy-link-button";
import { CancelQuoteButton } from "@/components/quotes/cancel-quote-button";

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { business } = await requireBusiness();

  const quote = await prisma.quote.findFirst({
    where: { id, businessId: business.id },
    include: {
      customer: true,
      items: { orderBy: { position: "asc" } },
      views: true,
      followUps: { orderBy: { sentAt: "desc" } },
    },
  });
  if (!quote) notFound();

  const publicUrl = `${getAppUrl()}/q/${quote.publicToken}`;
  const sendMessage = buildQuoteSendMessage({
    customerFirstName: firstName(quote.customer.name),
    quoteNumber: quote.number,
    quoteUrl: publicUrl,
  });
  const fallbackFollowUp = buildFollowUpMessage({
    customerFirstName: firstName(quote.customer.name),
    quoteNumber: quote.number,
  });

  const canSend = quote.status === "DRAFT";
  const canFollowUp = quote.status === "SENT" || quote.status === "VIEWED";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">
            Presupuesto #{quote.number} — {quote.customer.name}
          </h1>
          <p className="text-sm text-muted">
            Creado el {quote.createdAt.toLocaleDateString("es-AR")}
          </p>
        </div>
        <StatusBadge status={quote.status} />
      </div>

      {quote.status === "ACCEPTED" && (
        <div className="rounded-lg bg-success-light p-4 text-sm text-success">
          {quote.customer.name} aceptó este presupuesto
          {quote.acceptedAt ? ` el ${quote.acceptedAt.toLocaleDateString("es-AR")}` : ""}.
        </div>
      )}
      {quote.status === "REJECTED" && (
        <div className="rounded-lg bg-danger-light p-4 text-sm text-danger">
          {quote.customer.name} rechazó este presupuesto.
        </div>
      )}

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-ink">Detalle</h2>
        </CardHeader>
        <CardBody className="space-y-3">
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
            <div className="mt-1 flex justify-between text-base font-semibold text-ink">
              <span>Total</span>
              <span>{formatMoney(quote.total, quote.currency)}</span>
            </div>
          </div>
          {quote.conditions && (
            <p className="border-t border-border pt-3 text-sm text-muted">
              <span className="font-medium text-ink">Condiciones: </span>
              {quote.conditions}
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <h2 className="font-semibold text-ink">Link público</h2>
          <CopyLinkButton url={publicUrl} />
        </CardHeader>
        <CardBody>
          <p className="break-all text-sm text-muted">{publicUrl}</p>
          <p className="mt-1 text-xs text-muted">{quote.views.length} visualizaciones</p>
        </CardBody>
      </Card>

      {canSend && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-ink">Enviar presupuesto</h2>
          </CardHeader>
          <CardBody>
            <SendWhatsAppPanel
              quoteId={quote.id}
              initialMessage={sendMessage}
              phone={quote.customer.phone}
            />
          </CardBody>
        </Card>
      )}

      {canFollowUp && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-ink">Seguimiento</h2>
          </CardHeader>
          <CardBody>
            <FollowUpPanel
              quoteId={quote.id}
              phone={quote.customer.phone}
              fallbackMessage={fallbackFollowUp}
            />
            {quote.followUps.length > 0 && (
              <p className="mt-3 text-xs text-muted">
                Último seguimiento enviado el{" "}
                {quote.followUps[0].sentAt.toLocaleDateString("es-AR")}.
              </p>
            )}
          </CardBody>
        </Card>
      )}

      {quote.status !== "ACCEPTED" && quote.status !== "CANCELLED" && (
        <div className="flex justify-end">
          <CancelQuoteButton quoteId={quote.id} />
        </div>
      )}
    </div>
  );
}
