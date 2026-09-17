"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { loginAction } from "@/lib/actions/auth";
import { Input, Label } from "@/components/ui/input";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardBody } from "@/components/ui/card";

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, undefined);
  const params = useSearchParams();
  const justReset = params.get("reset") === "ok";

  return (
    <Card>
      <CardBody className="space-y-5">
        <div>
          <h1 className="text-lg font-semibold text-ink">Iniciá sesión</h1>
          <p className="text-sm text-muted">Entrá a tu cuenta de PresuFlow.</p>
        </div>

        {justReset && (
          <p className="rounded-lg bg-success-light px-3 py-2 text-sm text-success">
            Tu contraseña se actualizó. Iniciá sesión con la nueva.
          </p>
        )}

        <form action={formAction} className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div>
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
          </div>

          {state?.error && <p className="text-sm text-danger">{state.error}</p>}

          <SubmitButton className="w-full">Entrar</SubmitButton>
        </form>

        <div className="flex justify-between text-sm">
          <Link href="/recuperar" className="text-brand hover:underline">
            Olvidé mi contraseña
          </Link>
          <Link href="/registro" className="text-brand hover:underline">
            Crear cuenta
          </Link>
        </div>
      </CardBody>
    </Card>
  );
}
