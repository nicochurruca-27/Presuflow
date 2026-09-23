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

/**
 * The base URL now comes from the first of several variables that is set,
 * so any test about one of them has to silence the rest. Otherwise a test
 * would pass or fail depending on what happens to be in the environment.
 */
function clearAllSources() {
  for (const name of [
    "APP_URL",
    "NEXT_PUBLIC_APP_URL",
    "VERCEL_ENV",
    "VERCEL_URL",
    "VERCEL_PROJECT_PRODUCTION_URL",
  ]) {
    vi.stubEnv(name, undefined as unknown as string);
  }
}

describe("in production", () => {
  function production(url?: string) {
    clearAllSources();
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
    clearAllSources();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", undefined as unknown as string);
    expect(getAppUrl()).toBe("http://localhost:3000");
  });

  it("falls back when the value is blank", () => {
    clearAllSources();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    expect(getAppUrl()).toBe("http://localhost:3000");
  });

  it("warns and falls back on a typo instead of stopping the app", () => {
    clearAllSources();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "htp://localhost:3000");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(getAppUrl()).toBe("http://localhost:3000");
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });

  it("still uses a valid value when there is one", () => {
    clearAllSources();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://192.168.0.10:3000");
    expect(getAppUrl()).toBe("http://192.168.0.10:3000");
  });
});

describe("where the base URL comes from", () => {
  /**
   * Every caller of getAppUrl() is server-side, so the value does not need
   * the NEXT_PUBLIC_ prefix that ships it to the browser. `APP_URL` is the
   * one to use; the prefixed one stays supported so nothing already
   * configured breaks.
   */
  it("prefers APP_URL, which is not exposed to the browser", () => {
    clearAllSources();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "https://presuflow.app");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://vieja.example");

    expect(getAppUrl()).toBe("https://presuflow.app");
  });

  it("still honours NEXT_PUBLIC_APP_URL on its own", () => {
    clearAllSources();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://presuflow-alpha.vercel.app");

    expect(getAppUrl()).toBe("https://presuflow-alpha.vercel.app");
  });

  it("uses Vercel's production domain when nothing is configured", () => {
    // This is what makes a deploy work with zero variables set.
    clearAllSources();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "presuflow.vercel.app");
    vi.stubEnv("VERCEL_URL", "presuflow-abc123-nico.vercel.app");

    // The stable domain, not the per-deployment host: a link in an email has
    // to keep working after the next deploy.
    expect(getAppUrl()).toBe("https://presuflow.vercel.app");
  });

  it("uses the deployment URL on a preview", () => {
    clearAllSources();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "presuflow.vercel.app");
    vi.stubEnv("VERCEL_URL", "presuflow-git-rama-nico.vercel.app");

    // A preview must link to itself, not to production.
    expect(getAppUrl()).toBe("https://presuflow-git-rama-nico.vercel.app");
  });

  it("falls back to the deployment URL if the project domain is missing", () => {
    clearAllSources();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_URL", "presuflow-abc123-nico.vercel.app");

    expect(getAppUrl()).toBe("https://presuflow-abc123-nico.vercel.app");
  });

  it("adds the scheme Vercel omits", () => {
    clearAllSources();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_URL", "algo.vercel.app");

    expect(getAppUrl().startsWith("https://")).toBe(true);
  });

  it("lets an explicit variable override what Vercel reports", () => {
    // A custom domain has to win over the vercel.app host.
    clearAllSources();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "presuflow.vercel.app");
    vi.stubEnv("APP_URL", "https://app.presuflow.com.ar");

    expect(getAppUrl()).toBe("https://app.presuflow.com.ar");
  });

  it("names the offending variable when the value is unusable", () => {
    clearAllSources();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "no-es-una-url");

    let message = "";
    try {
      getAppUrl();
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain("APP_URL");
    expect(message).not.toContain("localhost");
  });
});
