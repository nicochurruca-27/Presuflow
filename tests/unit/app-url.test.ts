import { describe, it, expect, afterEach, vi } from "vitest";
import { getAppUrl, AppUrlNotConfiguredError } from "@/lib/env";

/**
 * The base URL is what password-reset links and public quote links are built
 * from. A localhost fallback is right on a laptop and wrong in production,
 * where it produces links that go nowhere — so the two environments are
 * pinned separately here.
 */
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("in production", () => {
  function production(url?: string) {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", url as string);
  }

  it("fails when the variable is missing", () => {
    production(undefined);
    expect(() => getAppUrl()).toThrow(AppUrlNotConfiguredError);
  });

  it("fails when the variable is blank, which is what an empty dashboard field sends", () => {
    production("");
    expect(() => getAppUrl()).toThrow(AppUrlNotConfiguredError);
    production("   ");
    expect(() => getAppUrl()).toThrow(AppUrlNotConfiguredError);
  });

  it("fails on something that isn't a URL", () => {
    for (const value of ["presuflow.app", "no es una url", "/relativo", "://roto"]) {
      production(value);
      expect(() => getAppUrl()).toThrow(AppUrlNotConfiguredError);
    }
  });

  it("fails on a URL that isn't http or https", () => {
    for (const value of ["ftp://presuflow.app", "javascript:alert(1)", "file:///etc/passwd"]) {
      production(value);
      expect(() => getAppUrl()).toThrow(AppUrlNotConfiguredError);
    }
  });

  it("never falls back to localhost", () => {
    production(undefined);
    let message = "";
    try {
      getAppUrl();
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/NEXT_PUBLIC_APP_URL/);
    expect(message).not.toContain("localhost");
  });

  it("accepts a real URL", () => {
    production("https://presuflow.app");
    expect(getAppUrl()).toBe("https://presuflow.app");
  });

  it("accepts the domains a real deployment uses", () => {
    // Deliberately permissive: a custom domain, a preview deployment, a
    // staging subdomain and a port all have to keep working.
    const cases: [string, string][] = [
      ["https://presuflow-alpha.vercel.app", "https://presuflow-alpha.vercel.app"],
      ["https://app.mi-negocio.com.ar", "https://app.mi-negocio.com.ar"],
      ["https://presuflow.app:8443", "https://presuflow.app:8443"],
      ["http://interno.lan", "http://interno.lan"],
    ];
    for (const [input, expected] of cases) {
      production(input);
      expect(getAppUrl()).toBe(expected);
    }
  });

  it("drops a trailing slash so built links don't get a double one", () => {
    production("https://presuflow.app/");
    expect(getAppUrl()).toBe("https://presuflow.app");
    expect(`${getAppUrl()}/q/token`).toBe("https://presuflow.app/q/token");
  });
});

describe("in development and test", () => {
  it("falls back to localhost when the variable is missing", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", undefined as unknown as string);
    expect(getAppUrl()).toBe("http://localhost:3000");
  });

  it("falls back when the value is blank", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    expect(getAppUrl()).toBe("http://localhost:3000");
  });

  it("warns and falls back on a typo instead of stopping the app", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "htp://localhost:3000");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(getAppUrl()).toBe("http://localhost:3000");
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });

  it("still uses a valid value when there is one", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://192.168.0.10:3000");
    expect(getAppUrl()).toBe("http://192.168.0.10:3000");
  });
});
