import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-12">
      <Link href="/" className="mb-8 text-xl font-semibold text-ink">
        Presu<span className="text-brand">Flow</span>
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
