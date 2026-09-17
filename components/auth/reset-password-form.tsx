"use client";

import { useActionState } from "react";
import { resetPasswordAction } from "@/lib/actions/auth";
import { Input, Label } from "@/components/ui/input";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardBody } from "@/components/ui/card";

export function ResetPasswordForm({ token }: { token: string }) {
  const boundAction = resetPasswordAction.bind(null, token);
  const [state, formAction] = useActionState(boundAction, undefined);

  return (
    <Card>
      <CardBody className="space-y-5">
        <div>
          <h1 className="text-lg font-semibold text-ink">Elegí una nueva contraseña</h1>
        </div>

        <form action={formAction} className="space-y-4">
          <div>
            <Label htmlFor="password">Nueva contraseña</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          {state?.error && <p className="text-sm text-danger">{state.error}</p>}
          <SubmitButton className="w-full">Guardar contraseña</SubmitButton>
        </form>
      </CardBody>
    </Card>
  );
}
