import Link from "next/link";
import { logoutAction } from "@/lib/actions/auth";
import { DesktopNav } from "@/components/app-shell/nav-links";
import { Button } from "@/components/ui/button";

export function Topbar({ businessName }: { businessName: string }) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="text-lg font-semibold text-ink shrink-0">
            Presu<span className="text-brand">Flow</span>
          </Link>
          <DesktopNav />
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted sm:inline">{businessName}</span>
          <Link
            href="/configuracion"
            className="hidden text-sm text-muted hover:text-ink sm:inline"
          >
            Configuración
          </Link>
          <form action={logoutAction}>
            <Button type="submit" variant="ghost" size="sm">
              Salir
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
