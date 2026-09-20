import { describe, it, expect, afterEach, vi } from "vitest";
import { sendEmail } from "@/lib/email/send";

/**
 * With no provider configured the app keeps working and says so. What it
 * says is the point here: the rendered body of a password-reset email
 * contains a working token, and a production log is not a place to keep one.
 *
 * There is no EMAIL_API_KEY in the test environment, so these exercise the
 * unconfigured path for real rather than through a mock.
 */
const RESET_HTML = '<a href="https://presuflow.app/restablecer/TOKEN-SECRETO-123">Restablecer</a>';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("sendEmail without a provider", () => {
  it("does not print the body in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const result = await sendEmail({
      to: "ana@test.com",
      subject: "Recuperá tu contraseña",
      html: RESET_HTML,
    });

    expect(result.delivered).toBe(false);
    expect(log).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();

    const printed = JSON.stringify(warn.mock.calls);
    expect(printed).not.toContain("TOKEN-SECRETO-123");
    // The operator still learns that a mail was not sent, and to whom.
    expect(printed).toContain("ana@test.com");
  });

  it("still prints the body in development, which is how you click the link", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await sendEmail({ to: "ana@test.com", subject: "Recuperá tu contraseña", html: RESET_HTML });

    expect(log).toHaveBeenCalledOnce();
    expect(String(log.mock.calls[0][0])).toContain("TOKEN-SECRETO-123");
  });

  it("never reports an undelivered mail as delivered", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const result = await sendEmail({ to: "ana@test.com", subject: "x", html: "<p>y</p>" });
    expect(result).toEqual({ delivered: false, reason: "EMAIL_API_KEY not configured" });
  });
});
