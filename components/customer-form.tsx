"use client";

import { useActionState } from "react";
import { Input, Label, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/submit-button";
import type { ActionState } from "@/lib/actions/auth";
import type { Customer } from "@prisma/client";

export function CustomerForm({
  action,
  customer,
  redirectToQuote,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  customer?: Customer;
  redirectToQuote?: boolean;
}) {
  const [state, formAction] = useActionState(action, undefined);

  return (
    <form action={formAction} className="space-y-4">
      {redirectToQuote && <input type="hidden" name="redirectToQuote" value="1" />}
      <div>
        <Label htmlFor="name">Nombre</Label>
        <Input id="name" name="name" required defaultValue={customer?.name} />
      </div>
      {/* One column on a phone: paired inputs at 320px leave each side too
          narrow for a phone number or an email address. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="phone">Teléfono</Label>
          <Input id="phone" name="phone" defaultValue={customer?.phone ?? ""} />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" defaultValue={customer?.email ?? ""} />
        </div>
      </div>
      <div>
        <Label htmlFor="address">Dirección</Label>
        <Input id="address" name="address" defaultValue={customer?.address ?? ""} />
      </div>
      <div>
        <Label htmlFor="notes">Notas</Label>
        <Textarea id="notes" name="notes" defaultValue={customer?.notes ?? ""} />
      </div>

      {state?.error && <p className="text-sm text-danger">{state.error}</p>}

      <SubmitButton className="w-full">{customer ? "Guardar cambios" : "Crear cliente"}</SubmitButton>
    </form>
  );
}
