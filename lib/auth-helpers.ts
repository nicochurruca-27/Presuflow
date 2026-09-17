import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/** Throws by redirecting to /login. Use in server components / server actions that require a logged-in user. */
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  return session.user;
}

/**
 * Returns the current user's business (tenant). Every data query in the app must
 * be scoped through this businessId — it is the sole isolation boundary between tenants.
 * Redirects to /onboarding if the user hasn't created a business yet.
 */
export async function requireBusiness() {
  const user = await requireUser();
  const business = await prisma.business.findUnique({
    where: { ownerId: user.id },
  });
  if (!business) {
    redirect("/onboarding");
  }
  return { user, business };
}

/** Same as requireBusiness but does not redirect — for API-style server actions. Returns null if missing. */
export async function getSessionBusiness() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const business = await prisma.business.findUnique({
    where: { ownerId: session.user.id },
  });
  if (!business) return null;
  return { user: session.user, business };
}
