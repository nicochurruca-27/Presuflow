"use client";

import { useActionState } from "react";
import { updateBusinessAction } from "@/lib/actions/business";
import { Input, Label, Select } from "@/components/ui/input";
import { SubmitButton } from "@/components/submit-button";
import { ACTIVITIES, CURRENCIES } from "@/lib/validation/business";
import type { Business } from "@prisma/client";

export function BusinessSettingsForm({ business }: { business: Business }) {
  const [state, formAction] = useActionState(updateBusinessAction, undefined);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label htmlFor="businessName">Nombre de tu negocio</Label>
        <Input id="businessName" name="businessName" required defaultValue={business.name} />
      </div>
      <div>
        <Label htmlFor="activity">Actividad</Label>
        <Select id="activity" name="activity" required defaultValue={business.activity ?? ""}>
          {ACTIVITIES.map((activity) => (
            <option key={activity} value={activity}>
              {activity}
            </option>
          ))}
        </Select>
      </div>
      {/* One column on a phone: paired inputs at 320px leave each side too
          narrow for a phone number or an email address. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="phone">Teléfono</Label>
          <Input id="phone" name="phone" defaultValue={business.phone ?? ""} />
        </div>
        <div>
          <Label htmlFor="currency">Moneda</Label>
          <Select id="currency" name="currency" defaultValue={business.currency}>
            {CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </Select>
        </div>
      </div>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      {state?.success && !state.error && (
        <p className="text-sm text-success">Cambios guardados.</p>
      )}
      <SubmitButton>Guardar cambios</SubmitButton>
    </form>
  );
}
