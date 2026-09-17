"use client";

import { useActionState } from "react";
import { completeOnboardingAction } from "@/lib/actions/business";
import { Input, Label, Select } from "@/components/ui/input";
import { SubmitButton } from "@/components/submit-button";
import { ACTIVITIES, CURRENCIES } from "@/lib/validation/business";

export function OnboardingForm() {
  const [state, formAction] = useActionState(completeOnboardingAction, undefined);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label htmlFor="businessName">Nombre de tu negocio</Label>
        <Input
          id="businessName"
          name="businessName"
          placeholder="Ej: Electricidad Martínez"
          required
        />
      </div>

      <div>
        <Label htmlFor="activity">Actividad</Label>
        <Select id="activity" name="activity" required defaultValue="">
          <option value="" disabled>
            Elegí tu actividad
          </option>
          {ACTIVITIES.map((activity) => (
            <option key={activity} value={activity}>
              {activity}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="phone">Teléfono (opcional)</Label>
          <Input id="phone" name="phone" placeholder="+54 9 11 ..." />
        </div>
        <div>
          <Label htmlFor="currency">Moneda</Label>
          <Select id="currency" name="currency" defaultValue="ARS">
            {CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {state?.error && <p className="text-sm text-danger">{state.error}</p>}

      <SubmitButton className="w-full" size="lg">
        Crear mi negocio
      </SubmitButton>
    </form>
  );
}
