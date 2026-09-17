import { requireBusiness } from "@/lib/auth-helpers";
import { Topbar } from "@/components/app-shell/topbar";
import { MobileTabBar } from "@/components/app-shell/nav-links";
import { NewQuoteFab } from "@/components/app-shell/new-quote-fab";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { business } = await requireBusiness();

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <Topbar businessName={business.name} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-6 md:pb-10">{children}</main>
      <MobileTabBar />
      <NewQuoteFab />
    </div>
  );
}
