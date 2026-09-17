import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="text-lg font-semibold text-ink">
            Presu<span className="text-brand">Flow</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/login" className="px-3 py-2 text-sm font-medium text-muted hover:text-ink">
              Iniciar sesión
            </Link>
            <Link href="/registro">
              <Button size="sm">Crear mi primer presupuesto</Button>
            </Link>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border bg-slate-50 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-sm text-muted sm:flex-row">
          <p>© {new Date().getFullYear()} PresuFlow. Todos los derechos reservados.</p>
          <div className="flex gap-5">
            <Link href="/terminos" className="hover:text-ink">
              Términos
            </Link>
            <Link href="/privacidad" className="hover:text-ink">
              Privacidad
            </Link>
            <Link href="/contacto" className="hover:text-ink">
              Contacto
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
