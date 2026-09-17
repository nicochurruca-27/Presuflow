import { describe, it, expect, afterAll } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { loginSchema, signupSchema } from "@/lib/validation/auth";

const userIds: string[] = [];

describe("password hashing (what auth.ts's authorize() relies on)", () => {
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("accepts the correct password and rejects a wrong one", async () => {
    const passwordHash = await bcrypt.hash("correct-horse-battery", 10);
    const user = await prisma.user.create({
      data: { name: "Auth Test", email: `auth_${Date.now()}@test.local`, passwordHash },
    });
    userIds.push(user.id);

    expect(await bcrypt.compare("correct-horse-battery", user.passwordHash)).toBe(true);
    expect(await bcrypt.compare("wrong-password", user.passwordHash)).toBe(false);
  });

  it("never stores the plaintext password", async () => {
    const passwordHash = await bcrypt.hash("super-secret-123", 10);
    expect(passwordHash).not.toBe("super-secret-123");
    expect(passwordHash.startsWith("$2")).toBe(true);
  });
});

describe("validation schemas", () => {
  it("rejects a signup password shorter than 8 characters", () => {
    const result = signupSchema.safeParse({ name: "A", email: "a@b.com", password: "short" });
    expect(result.success).toBe(false);
  });

  it("normalizes email to lowercase on login", () => {
    const result = loginSchema.safeParse({ email: "USER@Example.com", password: "x" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("user@example.com");
  });
});
