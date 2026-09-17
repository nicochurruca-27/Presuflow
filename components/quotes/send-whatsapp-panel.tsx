"use client";

import { useState, useTransition } from "react";
import { markQuoteSentAction } from "@/lib/actions/quotes";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function SendWhatsAppPanel({
  quoteId,
  initialMessage,
  phone,
}: {
  quoteId: string;
  initialMessage: string;
  phone: string | null;
}) {
  const [message, setMessage] = useState(initialMessage);
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);

  function handleSend() {
    window.open(buildWhatsAppUrl(phone, message), "_blank", "noopener,noreferrer");
    startTransition(async () => {
      await markQuoteSentAction(quoteId);
      setSent(true);
    });
  }

  return (
    <div className="space-y-2">
      <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} />
      {!phone && (
        <p className="text-sm text-warning">
          Este cliente no tiene teléfono cargado — vas a tener que elegir el contacto en WhatsApp.
        </p>
      )}
      <Button type="button" onClick={handleSend} disabled={pending} className="w-full">
        {pending ? "Abriendo WhatsApp..." : "Enviar por WhatsApp"}
      </Button>
      {sent && <p className="text-sm text-success">Presupuesto marcado como enviado.</p>}
    </div>
  );
}
