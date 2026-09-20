import { describe, it, expect, afterAll, vi } from "vitest";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { isSessionTokenValid, nowInSeconds } from "@/lib/session-validity";

/**
 * These exercise the decision the Auth.js `jwt` callback makes on every
 * session read: given a token stamped at `authAt`, is this session still
 * allowed? The callback itself is a three-line wrapper around
 * isSessionTokenValid(), which is what's tested here — auth.ts can't be
 * imported in this environment because next-auth pulls in next/server.
 */
class RedirectSignal extends Error {
  constructor(public url: string) {
    super(`REDIRECT:${url}`);
  }
}

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

vi.mock("next-auth", () => ({ AuthError: class AuthError extends Error {} }));

const sessionState: { userId: string | null } = { userId: null };

vi.mock("@/auth", () => ({
  signIn: async () => undefined,
  signOut: async () => undefined,
  auth: async () =>
    sessionState.userId ? { user: { id: sessionState.userId, email: "x@test.local" } } : null,
}));

const { resetPasswordAction } = await import("@/lib/actions/auth");
const { requireUser, requireBusiness } = await import("@/lib/auth-helpers");

const userIds: string[] = [];

async function makeUser(tag: string, withBusiness = false) {
  const passwordHash = await bcrypt.hash("original-password", 4);
  const user = await prisma.user.create({
    data: {
      name: `User ${tag}`,
      email: `session_${tag}_${Date.now()}_${Math.random()}@test.local`,
      passwordHash,
    },
  });
  userIds.push(user.id);
  if (withBusiness) {
    await prisma.business.create({
      data: { ownerId: user.id, name: `Business ${tag}`, currency: "ARS" },
    });
  }
  return user;
}

async function issueResetToken(userId: string) {
  const token = nanoid(48);
  await prisma.passwordResetToken.create({
    data: { userId, token, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
  });
  return token;
}

function resetForm(password: string) {
  const fd = new FormData();
  fd.set("password", password);
  return fd;
}

describe("session invalidation after a password change", () => {
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("a token issued before the reset stops authenticating", async () => {
    const user = await makeUser("stale-token");
    const tokenIssuedAt = nowInSeconds();

    // Valid while nothing has changed.
    expect(await isSessionTokenValid(user.id, tokenIssuedAt)).toBe(true);

    const resetToken = await issueResetToken(user.id);
    await expect(
      resetPasswordAction(resetToken, undefined, resetForm("brand-new-password"))
    ).rejects.toBeInstanceOf(RedirectSignal);

    // The reset recorded when the password changed...
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.passwordChangedAt).not.toBeNull();
    // ...and the old token is now refused.
    expect(await isSessionTokenValid(user.id, tokenIssuedAt - 60)).toBe(false);
  });

  it("the session created after the reset keeps working", async () => {
    const user = await makeUser("fresh-token");
    const resetToken = await issueResetToken(user.id);

    await expect(
      resetPasswordAction(resetToken, undefined, resetForm("brand-new-password"))
    ).rejects.toBeInstanceOf(RedirectSignal);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const afterReset = Math.floor(updated.passwordChangedAt!.getTime() / 1000) + 1;

    expect(await isSessionTokenValid(user.id, afterReset)).toBe(true);
  });

  it("rejects a token whose user no longer exists", async () => {
    const user = await makeUser("deleted-user");
    const authAt = nowInSeconds();
    await prisma.user.delete({ where: { id: user.id } });

    expect(await isSessionTokenValid(user.id, authAt)).toBe(false);
  });

  it("leaves accounts that never changed their password alone", async () => {
    const user = await makeUser("never-changed");
    // Even a token stamped long ago stays valid: there's nothing to revoke.
    expect(await isSessionTokenValid(user.id, nowInSeconds() - 86_400)).toBe(true);
  });

  it("the reset token itself is still single use", async () => {
    const user = await makeUser("single-use");
    const resetToken = await issueResetToken(user.id);

    await expect(
      resetPasswordAction(resetToken, undefined, resetForm("first-new-password"))
    ).rejects.toBeInstanceOf(RedirectSignal);

    const second = await resetPasswordAction(resetToken, undefined, resetForm("second-attempt"));
    expect(second?.error).toMatch(/venció o ya fue usado/i);
  });

  it("requireUser and requireBusiness keep working for a valid session", async () => {
    const user = await makeUser("helpers-ok", true);
    sessionState.userId = user.id;

    const sessionUser = await requireUser();
    expect(sessionUser.id).toBe(user.id);

    const { business } = await requireBusiness();
    expect(business.ownerId).toBe(user.id);

    sessionState.userId = null;
  });

  it("requireUser redirects to login when there is no session", async () => {
    sessionState.userId = null;
    await expect(requireUser()).rejects.toBeInstanceOf(RedirectSignal);
  });

  it("requireBusiness sends a user with no business to onboarding", async () => {
    const user = await makeUser("no-business");
    sessionState.userId = user.id;

    await expect(requireBusiness()).rejects.toMatchObject({ url: "/onboarding" });

    sessionState.userId = null;
  });
});
