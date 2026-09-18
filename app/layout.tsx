import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { getAppUrl } from "@/lib/env";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(getAppUrl()),
  title: {
    default: "PresuFlow — Presupuestos profesionales en segundos",
    template: "%s · PresuFlow",
  },
  description:
    "Creá presupuestos profesionales en segundos, enviálos por WhatsApp y dejá de perder trabajos por falta de seguimiento.",
  openGraph: {
    title: "PresuFlow — Presupuestos profesionales en segundos",
    description:
      "Creá, enviá y hacé seguimiento de tus presupuestos desde un solo lugar.",
    type: "website",
    locale: "es_AR",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        {children}
      </body>
    </html>
  );
}
