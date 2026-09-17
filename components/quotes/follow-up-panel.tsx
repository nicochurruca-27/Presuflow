"use client";

import { useState, useTransition } from "react";
import { generateFollowUpMessageAction, recordFollowUpAction } from "@/lib/actions/quotes";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function FollowUpPanel({
  quoteId,
  phone,
  fallbackMessage,
}: {
  quoteId: string;
  phone: string | null;
  fallbackMessage: string;
}) {
  const [message, setMessage] = useState(fallbackMessage);
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);

  function generate() {
    startTransition(async () => {
      const result = await generateFollowUpMessageAction(quoteId);
      if (result.message) setMessage(result.message);
    });
  }

  function send() {
    window.open(buildWhatsAppUrl(phone, message), "_blank", "noopener,noreferrer");
    startTransition(async () => {
      await recordFollowUpAction(quoteId, message);
      setSent(true);
    });
  }

  return (
    <div id="seguimiento" className="space-y-2">
      <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" variant="outline" onClick={generate} disabled={pending}>
          ✨ Generar mensaje
        </Button>
        <Button type="button" onClick={send} disabled={pending} className="flex-1">
          Enviar seguimiento por WhatsApp
        </Button>
      </div>
      {sent && <p className="text-sm text-success">Seguimiento registrado.</p>}
    </div>
  );
}
