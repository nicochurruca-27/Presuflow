import { describe, it, expect, afterAll, beforeEach, afterEach, vi } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

/**
 * End-to-end check that the links we actually mail are built from the
 * configured base URL, rather than from a fallback or a hand-made string.
 */
const BASE = "https://presuflow.example";

const sent: { to: string; subject: string; html: string }[] = [];

vi.mock("@/lib/email/send", () => ({
  sendEmail: async (input: { to: string; subject: string; html: string }) => {
    sent.push(input);
    return { delivered: true };
  },
}));

vi.mock("next-auth", () => ({ AuthError: class AuthError extends Error {} }));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

vi.mock("@/auth", () => ({
  signIn: async () => undefined,
  signOut: async () => undefined,
  auth: async () => null,
}));

const { requestPasswordResetAction } = await import("@/lib/actions/auth");

const userIds: string[] = [];

beforeEach(() => {
  sent.length = 0;
  vi.stubEnv("NEXT_PUBLIC_APP_URL", BASE);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

async function makeUser(tag: string) {
  const user = await prisma.user.create({
    data: {
      name: `User ${tag}`,
      email: `links_${tag}_${Date.now()}_${Math.random()}@test.local`,
      passwordHash: await bcrypt.hash("password123", 4),
    },
  });
  userIds.push(user.id);
  return user;
}

function resetForm(email: string) {
  const fd = new FormData();
  fd.set("email", email);
  return fd;
}

describe("password reset email", () => {
  it("links to the configured base URL with the real token", async () => {
    const user = await makeUser("reset-link");

    await requestPasswordResetAction(undefined, resetForm(user.email));

    expect(sent).toHaveLength(1);
    const token = await prisma.passwordResetToken.findFirstOrThrow({
      where: { userId: user.id },
    });
    expect(sent[0].html).toContain(`href="${BASE}/restablecer/${token.token}"`);
    expect(sent[0].html).not.toContain("localhost");
  });

  it("follows the environment rather than a baked-in value", async () => {
    const user = await makeUser("other-domain");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.mi-negocio.com.ar");

    await requestPasswordResetAction(undefined, resetForm(user.email));

    expect(sent[0].html).toContain('href="https://app.mi-negocio.com.ar/restablecer/');
  });

  it("does not leak the token into the subject line", async () => {
    const user = await makeUser("subject");
    await requestPasswordResetAction(undefined, resetForm(user.email));

    const token = await prisma.passwordResetToken.findFirstOrThrow({ where: { userId: user.id } });
    expect(sent[0].subject).not.toContain(token.token);
  });
});
