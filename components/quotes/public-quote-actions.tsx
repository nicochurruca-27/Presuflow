"use client";

import { useFormStatus } from "react-dom";

/**
 * Accept / reject on the public quote page.
 *
 * These were plain submit buttons with no pending state. The transition
 * itself is atomic and idempotent (Bloque 2), so a double click was never a
 * correctness problem — but on a phone, over a slow connection, a button
 * that does nothing visible for two seconds reads as broken, and the
 * customer taps it again. This is the one screen where that matters most:
 * it's what gets opened from WhatsApp.
 */
function SubmitButton({
  className,
  pendingLabel,
  children,
}: {
  className: string;
  pendingLabel: string;
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${className} disabled:opacity-70`}>
      {pending ? pendingLabel : children}
    </button>
  );
}

export function PublicQuoteActions({
  acceptAction,
  rejectAction,
}: {
  acceptAction: () => Promise<void>;
  rejectAction: () => Promise<void>;
}) {
  return (
    <>
      <form action={acceptAction}>
        <SubmitButton
          className="w-full rounded-lg bg-success px-4 py-3 font-semibold text-white hover:bg-green-700"
          pendingLabel="Aceptando..."
        >
          Aceptar presupuesto
        </SubmitButton>
      </form>
      <form action={rejectAction}>
        <SubmitButton
          className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-muted hover:bg-slate-50"
          pendingLabel="Enviando..."
        >
          Rechazar
        </SubmitButton>
      </form>
    </>
  );
}
