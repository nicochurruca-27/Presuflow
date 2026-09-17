"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

export function NewQuoteFab() {
  const pathname = usePathname();
  if (pathname.startsWith("/presupuestos/nuevo")) return null;

  return (
    <Link
      href="/presupuestos/nuevo"
      className="fixed bottom-20 right-4 z-30 md:hidden"
      aria-label="Nuevo presupuesto"
    >
      <Button size="lg" className="rounded-full shadow-lg">
        + Nuevo
      </Button>
    </Link>
  );
}
