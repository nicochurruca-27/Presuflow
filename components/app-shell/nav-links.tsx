"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const LINKS = [
  { href: "/dashboard", label: "Inicio", icon: "🏠" },
  { href: "/presupuestos", label: "Presupuestos", icon: "🧾" },
  { href: "/clientes", label: "Clientes", icon: "👥" },
  { href: "/estadisticas", label: "Estadísticas", icon: "📊" },
];

export function DesktopNav() {
  const pathname = usePathname();
  return (
    <nav className="hidden items-center gap-1 md:flex">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={cn(
            "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            pathname.startsWith(link.href)
              ? "bg-brand-light text-brand-dark"
              : "text-muted hover:bg-slate-100 hover:text-ink"
          )}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

export function MobileTabBar() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-surface md:hidden">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={cn(
            "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium",
            pathname.startsWith(link.href) ? "text-brand" : "text-muted"
          )}
        >
          <span className="text-base leading-none">{link.icon}</span>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
