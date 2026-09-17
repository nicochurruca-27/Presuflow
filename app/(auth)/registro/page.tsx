"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signupAction } from "@/lib/actions/auth";
import { Input, Label } from "@/components/ui/input";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardBody } from "@/components/ui/card";

export default function SignupPage() {
  const [state, formAction] = useActionState(signupAction, undefined);

  return (
    <Card>
      <CardBody className="space-y-5">
        <div>
          <h1 className="text-lg font-semibold text-ink">Creá tu cuenta</h1>
          <p className="text-sm text-muted">En un minuto armás tu primer presupuesto.</p>
        </div>

        <form action={formAction} className="space-y-4">
          <div>
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" name="name" required autoComplete="name" />
          </div>
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
              minLength={8}
              autoComplete="new-password"
            />
          </div>

          {state?.error && <p className="text-sm text-danger">{state.error}</p>}

          <SubmitButton className="w-full">Crear cuenta</SubmitButton>
        </form>

        <p className="text-sm text-muted">
          ¿Ya tenés cuenta?{" "}
          <Link href="/login" className="text-brand hover:underline">
            Iniciá sesión
          </Link>
        </p>
      </CardBody>
    </Card>
  );
}
