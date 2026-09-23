/**
 * Base URL of the app, used to build absolute links (emails, quote links,
 * sitemap, metadata).
 *
 * Every caller of `getAppUrl()` runs on the server — the transactional email
 * templates, `metadataBase`, robots.txt, sitemap.xml, the password-reset
 * link and the public quote link. No client component reads it. That's why
 * the preferred variable is `APP_URL`, with no `NEXT_PUBLIC_` prefix: the
 * prefix inlines a value into the browser bundle, and this value has no
 * business being there.
 *
 * `NEXT_PUBLIC_APP_URL` still works, so an existing `.env` or an already
 * configured deployment keeps running unchanged.
 *
 * Two things this has to get right, both learned the hard way:
 * - `??` isn't enough. A variable left blank in a hosting dashboard arrives
 *   as an empty string, not undefined, and `??` doesn't catch that.
 * - A localhost fallback is exactly what you want on a laptop and exactly
 *   what you don't want in production, where it produces password-reset and
 *   public quote links that go nowhere.
 */

const DEV_FALLBACK = "http://localhost:3000";

/** Thrown when production can't build a correct absolute URL. */
export class AppUrlNotConfiguredError extends Error {
  constructor(detail: string) {
    super(
      `No hay una URL base válida para la app: ${detail}. ` +
        `Definí APP_URL (o NEXT_PUBLIC_APP_URL) con una URL http(s) válida. ` +
        `En Vercel también sirven las variables del sistema VERCEL_PROJECT_PRODUCTION_URL o VERCEL_URL.`
    );
    this.name = "AppUrlNotConfiguredError";
  }
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Vercel exposes host names without a scheme; its deployments are always https. */
function fromVercelHost(host: string | undefined): string | null {
  const trimmed = host?.trim();
  return trimmed ? `https://${trimmed}` : null;
}

/**
 * Where the base URL comes from, in order of preference.
 *
 * The two explicit variables win, because an operator setting one has a
 * reason — a custom domain, a staging host. Only if neither is set do we
 * fall back to what Vercel tells us about the deployment, which is what
 * makes a deploy work with nothing configured at all.
 *
 * In production the stable project domain is preferred over `VERCEL_URL`,
 * which is the immutable per-deployment host: links in an email should keep
 * working after the next deploy.
 */
function resolveConfiguredUrl(): { raw: string; source: string } | null {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) return { raw: explicit, source: "APP_URL" };

  const legacy = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (legacy) return { raw: legacy, source: "NEXT_PUBLIC_APP_URL" };

  if (process.env.VERCEL_ENV === "production") {
    const productionDomain = fromVercelHost(process.env.VERCEL_PROJECT_PRODUCTION_URL);
    if (productionDomain) {
      return { raw: productionDomain, source: "VERCEL_PROJECT_PRODUCTION_URL" };
    }
  }

  const deployment = fromVercelHost(process.env.VERCEL_URL);
  if (deployment) return { raw: deployment, source: "VERCEL_URL" };

  return null;
}

/**
 * Accepts anything that is a real http(s) URL, and nothing else.
 *
 * Deliberately permissive about the rest: any host, any port, any path, so
 * a custom domain, a staging subdomain or a preview deployment all pass.
 * The trailing slash is dropped because every caller appends its own path
 * and `${base}/q/token` would otherwise produce a double slash.
 */
function normalizeAppUrl(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (!parsed.hostname) return null;

  return parsed.toString().replace(/\/+$/, "");
}

export function getAppUrl(): string {
  const configured = resolveConfiguredUrl();

  if (!configured) {
    // Failing loudly here is the point: nothing configured in production
    // must not quietly become a link to localhost in someone's inbox.
    if (isProduction()) throw new AppUrlNotConfiguredError("no hay ninguna definida");
    return DEV_FALLBACK;
  }

  const normalized = normalizeAppUrl(configured.raw);
  if (!normalized) {
    if (isProduction()) {
      throw new AppUrlNotConfiguredError(`${configured.source} no es una URL válida`);
    }
    // On a laptop a typo shouldn't stop the app; it should be visible.
    console.warn(
      `[env] ${configured.source} no es una URL válida, usando el fallback de desarrollo`
    );
    return DEV_FALLBACK;
  }

  return normalized;
}

/**
 * Whether email delivery is configured.
 *
 * Email is deliberately optional: the app is usable without a provider (see
 * lib/email/send.ts), so a missing key must never stop the app from
 * starting. Same reasoning for the AI key, which is checked in lib/ai.
 */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.EMAIL_API_KEY);
}
