import { prisma } from "@/lib/prisma";

/**
 * Sessions are stateless JWTs, so a token stays cryptographically valid
 * until it expires — changing the password can't retract one by itself.
 * The fix without moving to database sessions: stamp the token with when
 * the person authenticated, record when the password last changed, and
 * refuse any token older than that change.
 *
 * The comparison deliberately uses the token's own `authAt` claim rather
 * than the standard `iat`: Auth.js re-signs the JWT with a fresh `iat` on
 * every session read, so `iat` means "last refresh", not "when this person
 * logged in". `authAt` is written once, at sign-in.
 */

/** Seconds, matching the JWT claim unit. */
export function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * True when a token predates the account's last password change and must
 * therefore be rejected.
 *
 * Fails closed: a token with no `authAt` can't be proven to be newer than
 * the change, so once a password has been changed such a token is refused.
 * The boundary is inclusive (a token stamped in the same second as the
 * change survives) because the risk of locking out the session the person
 * just created outweighs a sub-second window for a stolen one.
 */
export function isTokenStale(
  authAt: number | null | undefined,
  passwordChangedAt: Date | null
): boolean {
  if (!passwordChangedAt) return false;
  if (typeof authAt !== "number") return true;
  return authAt < Math.floor(passwordChangedAt.getTime() / 1000);
}

/**
 * Looks the account up and decides whether the token still represents a
 * valid session. A deleted user invalidates too.
 */
export async function isSessionTokenValid(
  userId: string,
  authAt: number | null | undefined
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordChangedAt: true },
  });
  if (!user) return false;
  return !isTokenStale(authAt, user.passwordChangedAt);
}
