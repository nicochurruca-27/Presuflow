import { describe, it, expect, afterEach, vi } from "vitest";
import { redactSecrets, describeError, logError } from "@/lib/log";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("redactSecrets", () => {
  it("masks the actual value of a secret environment variable", () => {
    vi.stubEnv("AUTH_SECRET", "Nicopresuflow2027churruca");
    const line = "falló al firmar con Nicopresuflow2027churruca y reintentó";
    expect(redactSecrets(line)).toBe("falló al firmar con [REDACTADO] y reintentó");
    expect(redactSecrets(line)).not.toContain("Nicopresuflow2027churruca");
  });

  it("masks every configured secret, not just one", () => {
    vi.stubEnv("EMAIL_API_KEY", "re_live_abcdefghijklmnop");
    vi.stubEnv("AI_API_KEY", "sk-ant-api03-qrstuvwxyz");
    const line = "Authorization: Bearer re_live_abcdefghijklmnop / x-api-key: sk-ant-api03-qrstuvwxyz";
    const output = redactSecrets(line);
    expect(output).not.toContain("re_live_abcdefghijklmnop");
    expect(output).not.toContain("sk-ant-api03-qrstuvwxyz");
  });

  it("does not turn the log to noise over a trivially short value", () => {
    // A one-character secret would otherwise match half the alphabet.
    vi.stubEnv("AUTH_SECRET", "abc");
    expect(redactSecrets("abcdefghij")).toBe("abcdefghij");
  });

  it("masks a password hash Prisma put in an error message", () => {
    const prismaish =
      'Invalid `prisma.user.create()` invocation: { email: "ana@test.com", passwordHash: "$2b$10$abcdefghijklmnop" }';
    const output = redactSecrets(prismaish);
    expect(output).not.toContain("$2b$10$abcdefghijklmnop");
    expect(output).toContain("[REDACTADO]");
    // The useful part survives, or the log is worthless.
    expect(output).toContain("prisma.user.create()");
    expect(output).toContain("ana@test.com");
  });

  it("masks reset and session tokens however they're written", () => {
    expect(redactSecrets('token: "aBcD1234ef"')).not.toContain("aBcD1234ef");
    expect(redactSecrets("https://app.test/restablecer?token=aBcD1234ef")).not.toContain(
      "aBcD1234ef"
    );
    expect(redactSecrets('{"sessionToken":"xyz987"}')).not.toContain("xyz987");
    expect(redactSecrets("password: 'clave-en-claro'")).not.toContain("clave-en-claro");
  });

  it("masks credentials embedded in a connection string", () => {
    const output = redactSecrets(
      "Can't reach postgresql://presuflow:clave-super-secreta@localhost:5432/presuflow_dev"
    );
    expect(output).not.toContain("clave-super-secreta");
    // Host and database stay, because that's what you debug with.
    expect(output).toContain("localhost:5432/presuflow_dev");
  });

  it("leaves an ordinary message untouched", () => {
    expect(redactSecrets("Unique constraint failed on the fields: (`email`)")).toBe(
      "Unique constraint failed on the fields: (`email`)"
    );
  });
});

describe("describeError", () => {
  it("keeps name, message and code, and nothing else", () => {
    const err = Object.assign(new Error("algo falló"), {
      code: "P2002",
      request: { headers: { authorization: "Bearer secreto" } },
    });
    const summary = describeError(err);

    expect(summary).toEqual({ name: "Error", message: "algo falló", code: "P2002" });
    // The request object, where credentials live, is not carried over at all.
    expect(JSON.stringify(summary)).not.toContain("Bearer");
  });

  it("redacts the message it keeps", () => {
    vi.stubEnv("AUTH_SECRET", "valor-secreto-largo");
    expect(describeError(new Error("usando valor-secreto-largo")).message).toBe(
      "usando [REDACTADO]"
    );
  });

  it("handles a provider that reports a plain object instead of throwing", () => {
    // This is Resend's shape.
    expect(describeError({ name: "validation_error", message: "domain not verified" })).toEqual({
      name: "validation_error",
      message: "domain not verified",
    });
  });

  it("handles anything else without blowing up", () => {
    expect(describeError("texto suelto")).toEqual({
      name: "UnknownError",
      message: "texto suelto",
    });
    expect(describeError(undefined).name).toBe("UnknownError");
  });
});

describe("logError", () => {
  it("writes a summary, never the raw error", () => {
    vi.stubEnv("EMAIL_API_KEY", "re_live_clave_secreta_1234");
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logError("email", new Error("falló con re_live_clave_secreta_1234"), { to: "ana@test.com" });

    expect(spy).toHaveBeenCalledOnce();
    const printed = JSON.stringify(spy.mock.calls[0]);
    expect(printed).not.toContain("re_live_clave_secreta_1234");
    expect(printed).toContain("[REDACTADO]");
    expect(printed).toContain("ana@test.com");
  });
});
