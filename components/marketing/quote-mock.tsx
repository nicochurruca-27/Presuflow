export function QuoteMock() {
  return (
    <div className="mx-auto w-full max-w-sm rounded-2xl border border-border bg-surface shadow-xl">
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-ink">Electricidad Martínez</p>
          <span className="rounded-full bg-brand-light px-2 py-0.5 text-[11px] font-medium text-brand-dark">
            Pendiente
          </span>
        </div>
        <p className="mt-1 text-xs text-muted">Presupuesto #1048 · Juan Pérez</p>
      </div>
      <div className="space-y-2 p-4 text-sm">
        <div className="flex justify-between">
          <span className="text-ink">Instalación tablero eléctrico</span>
          <span className="font-medium text-ink">$180.000</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink">Materiales</span>
          <span className="font-medium text-ink">$70.000</span>
        </div>
        <div className="mt-2 flex justify-between border-t border-border pt-2 text-base font-bold text-ink">
          <span>Total</span>
          <span>$250.000</span>
        </div>
      </div>
      <div className="p-4 pt-0">
        <div className="w-full rounded-lg bg-success py-2.5 text-center text-sm font-semibold text-white">
          Aceptar presupuesto
        </div>
      </div>
    </div>
  );
}
