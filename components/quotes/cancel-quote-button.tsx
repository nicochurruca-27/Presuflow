"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelQuoteAction } from "@/lib/actions/quotes";
import { Button } from "@/components/ui/button";

export function CancelQuoteButton({ quoteId }: { quoteId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    if (!confirm("¿Cancelar este presupuesto? Esta acción no se puede deshacer.")) return;
    startTransition(async () => {
      await cancelQuoteAction(quoteId);
      router.refresh();
    });
  }

  return (
    <Button type="button" variant="ghost" size="sm" onClick={handleClick} disabled={pending}>
      Cancelar presupuesto
    </Button>
  );
}
