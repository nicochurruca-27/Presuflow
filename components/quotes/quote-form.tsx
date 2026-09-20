"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { createQuoteAction } from "@/lib/actions/quotes";
import { createCustomerInlineAction } from "@/lib/actions/customers";
import {
  draftQuoteWithAiAction,
  improveDescriptionAction,
  generateConditionsAction,
} from "@/lib/actions/quotes";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import { formatMoney } from "@/lib/money";
import { computeQuoteTotals } from "@/lib/validation/quote";

interface CustomerOption {
  id: string;
  name: string;
}

interface ItemDraft {
  description: string;
  detail: string;
  quantity: string;
  unitPrice: string;
}

const EMPTY_ITEM: ItemDraft = { description: "", detail: "", quantity: "1", unitPrice: "" };

export function QuoteForm({
  customers,
  currency,
  aiEnabled,
  defaultCustomerId,
}: {
  customers: CustomerOption[];
  currency: string;
  aiEnabled: boolean;
  defaultCustomerId?: string;
}) {
  const [items, setItems] = useState<ItemDraft[]>([EMPTY_ITEM]);
  const [discount, setDiscount] = useState("0");
  const [conditions, setConditions] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiPending, startAiTransition] = useTransition();
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiNotes, setAiNotes] = useState<string[]>([]);
  const [conditionsPending, startConditionsTransition] = useTransition();

  // The customer list starts as whatever the server rendered and grows when
  // one is created inline, so the new customer is selectable straight away
  // without a round trip that would throw away the draft.
  const [customerOptions, setCustomerOptions] = useState<CustomerOption[]>(customers);
  const [customerId, setCustomerId] = useState(defaultCustomerId ?? "");
  const [showNewCustomer, setShowNewCustomer] = useState(customers.length === 0);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [customerPending, startCustomerTransition] = useTransition();

  function createCustomerInline() {
    setCustomerError(null);
    startCustomerTransition(async () => {
      const result = await createCustomerInlineAction(newCustomerName, newCustomerPhone);
      if (result.error || !result.customer) {
        setCustomerError(result.error ?? "No pudimos crear el cliente.");
        return;
      }
      const created = result.customer;
      setCustomerOptions((prev) => [created, ...prev]);
      setCustomerId(created.id);
      setNewCustomerName("");
      setNewCustomerPhone("");
      setShowNewCustomer(false);
    });
  }

  const [state, formAction] = useActionState(createQuoteAction, undefined);

  function updateItem(index: number, patch: Partial<ItemDraft>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function addItem() {
    setItems((prev) => [...prev, EMPTY_ITEM]);
  }

  function removeItem(index: number) {
    setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  function runAiDraft() {
    setAiError(null);
    setAiNotes([]);
    startAiTransition(async () => {
      const result = await draftQuoteWithAiAction(aiPrompt);
      if (result.error) {
        setAiError(result.error);
        return;
      }
      if (result.items) {
        setItems(
          result.items.map((item) => ({
            description: item.description,
            detail: item.detail,
            quantity: String(item.quantity || 1),
            unitPrice: item.unitPrice === null ? "" : String(item.unitPrice),
          }))
        );
      }
      setAiNotes(result.missingInfo ?? []);
    });
  }

  function improveItemDescription(index: number) {
    const current = items[index];
    if (!current.description.trim()) return;
    startAiTransition(async () => {
      const result = await improveDescriptionAction(current.description);
      if (result.text) updateItem(index, { description: result.text });
    });
  }

  function fillConditions() {
    startConditionsTransition(async () => {
      const result = await generateConditionsAction();
      if (result.text) setConditions(result.text);
    });
  }

  const numericItems = items.map((item) => ({
    description: item.description,
    detail: item.detail,
    quantity: Number(item.quantity) || 0,
    unitPrice: Number(item.unitPrice) || 0,
  }));
  const totals = computeQuoteTotals(numericItems, Number(discount) || 0);
  const hasMissingPrice = items.some((item) => item.unitPrice === "");

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (hasMissingPrice) {
          e.preventDefault();
          setAiError("Completá el precio de todos los ítems antes de continuar.");
        }
      }}
      className="space-y-6"
    >
      <input type="hidden" name="itemsJson" value={JSON.stringify(numericItems)} />

      {aiEnabled && (
        <div className="rounded-xl border border-brand/30 bg-brand-light p-4">
          <p className="mb-2 text-sm font-semibold text-brand-dark">✨ Crear con IA</p>
          <Textarea
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder='Ej: "Instalación de aire acondicionado 3000 frigorías, incluye materiales y mano de obra, precio 180 mil"'
            className="bg-surface"
          />
          <div className="mt-2 flex items-center justify-between">
            <Button type="button" size="sm" onClick={runAiDraft} disabled={aiPending || !aiPrompt.trim()}>
              {aiPending ? "Generando..." : "Generar presupuesto"}
            </Button>
          </div>
          {aiNotes.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-sm text-warning">
              {aiNotes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="customerId">Cliente</Label>
          <button
            type="button"
            onClick={() => setShowNewCustomer((open) => !open)}
            className="text-sm font-medium text-brand hover:underline"
          >
            {showNewCustomer ? "Cancelar" : "+ Nuevo cliente"}
          </button>
        </div>
        <Select
          id="customerId"
          name="customerId"
          required
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
        >
          <option value="" disabled>
            Elegí un cliente
          </option>
          {customerOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>

        {showNewCustomer && (
          <div className="mt-2 space-y-2 rounded-lg border border-border bg-slate-50 p-3">
            <p className="text-sm font-medium text-ink">Nuevo cliente</p>
            <Input
              placeholder="Nombre del cliente"
              value={newCustomerName}
              onChange={(e) => setNewCustomerName(e.target.value)}
            />
            <Input
              placeholder="Teléfono (opcional)"
              value={newCustomerPhone}
              onChange={(e) => setNewCustomerPhone(e.target.value)}
            />
            {customerError && <p className="text-sm text-danger">{customerError}</p>}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                onClick={createCustomerInline}
                disabled={customerPending || !newCustomerName.trim()}
              >
                {customerPending ? "Creando..." : "Crear y usar"}
              </Button>
              <Link href="/clientes/nuevo?fromQuote=1" className="self-center text-sm text-muted hover:underline">
                Cargar todos los datos
              </Link>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <Label>Servicios / productos</Label>
        {items.map((item, index) => (
          <div key={index} className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex gap-2">
              <Input
                placeholder="Descripción del servicio"
                value={item.description}
                onChange={(e) => updateItem(index, { description: e.target.value })}
                required
              />
              {aiEnabled && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => improveItemDescription(index)}
                  disabled={aiPending}
                >
                  ✨
                </Button>
              )}
              {items.length > 1 && (
                <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(index)}>
                  ✕
                </Button>
              )}
            </div>
            {/* The column, the validation, the storage and both views for
                `detail` all existed — the only thing missing was a way for
                anyone to type one. Until now it could only be filled by the
                AI draft. */}
            <Textarea
              rows={2}
              placeholder="Detalle (opcional): materiales, marca, aclaraciones"
              value={item.detail}
              onChange={(e) => updateItem(index, { detail: e.target.value })}
            />
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label htmlFor={`qty-${index}`}>Cantidad</Label>
                <Input
                  id={`qty-${index}`}
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={item.quantity}
                  onChange={(e) => updateItem(index, { quantity: e.target.value })}
                  required
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor={`price-${index}`}>Precio unitario ({currency})</Label>
                <Input
                  id={`price-${index}`}
                  type="number"
                  min="0"
                  step="1"
                  placeholder="Ej: 25000"
                  value={item.unitPrice}
                  onChange={(e) => updateItem(index, { unitPrice: e.target.value })}
                  required
                />
              </div>
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addItem}>
          + Agregar ítem
        </Button>
      </div>

      <div>
        <Label htmlFor="discount">Descuento ({currency}, opcional)</Label>
        <Input
          id="discount"
          name="discount"
          type="number"
          min="0"
          value={discount}
          onChange={(e) => setDiscount(e.target.value)}
        />
      </div>

      {/* Stacked on a narrow phone: side by side, a date input plus a
          two-line label leaves neither field readable. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="validUntil">Válido hasta</Label>
          <Input id="validUntil" name="validUntil" type="date" />
        </div>
        <div>
          <Label htmlFor="workDate">Fecha estimada del trabajo</Label>
          <Input id="workDate" name="workDate" type="date" />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <Label htmlFor="conditions">Condiciones</Label>
          {aiEnabled && (
            <Button type="button" variant="ghost" size="sm" onClick={fillConditions} disabled={conditionsPending}>
              {conditionsPending ? "Generando..." : "✨ Generar"}
            </Button>
          )}
        </div>
        <Textarea
          id="conditions"
          name="conditions"
          value={conditions}
          onChange={(e) => setConditions(e.target.value)}
          placeholder="Ej: Presupuesto válido por 15 días. Seña del 50% para reservar fecha."
        />
      </div>

      <div>
        <Label htmlFor="notes">Notas para el cliente (opcional)</Label>
        <Textarea id="notes" name="notes" placeholder="Cualquier aclaración adicional" />
      </div>

      <div className="rounded-lg bg-slate-100 p-4 text-sm">
        <div className="flex justify-between">
          <span className="text-muted">Subtotal</span>
          <span>{formatMoney(totals.subtotal, currency)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Descuento</span>
          <span>-{formatMoney(totals.discount, currency)}</span>
        </div>
        <div className="mt-1 flex justify-between border-t border-border pt-1 text-base font-semibold">
          <span>Total</span>
          <span>{formatMoney(totals.total, currency)}</span>
        </div>
      </div>

      {(aiError || state?.error) && <p className="text-sm text-danger">{aiError || state?.error}</p>}

      <SubmitButton size="lg" className="w-full" disabled={customers.length === 0}>
        Crear presupuesto
      </SubmitButton>
    </form>
  );
}
