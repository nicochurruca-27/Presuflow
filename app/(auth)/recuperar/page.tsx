"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordResetAction } from "@/lib/actions/auth";
import { Input, Label } from "@/components/ui/input";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardBody } from "@/components/ui/card";

export default function RecoverPage() {
  const [, formAction] = useActionState(requestPasswordResetAction, undefined);

  return (
    <Card>
      <CardBody className="space-y-5">
        <div>
          <h1 className="text-lg font-semibold text-ink">Recuperar contraseña</h1>
          <p className="text-sm text-muted">
            Ingresá tu email y te enviamos un enlace para restablecerla.
          </p>
        </div>

        <form action={formAction} className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <SubmitButton className="w-full">Enviar enlace</SubmitButton>
        </form>

        <p className="text-sm text-muted">
          Si el email existe en PresuFlow, te llegará un enlace para restablecer la contraseña.
        </p>

        <p className="text-sm">
          <Link href="/login" className="text-brand hover:underline">
            Volver a iniciar sesión
          </Link>
        </p>
      </CardBody>
    </Card>
  );
}
