/**
 * Public base URL of the app, used to build absolute links (emails, quote
 * links, sitemap, metadata).
 *
 * Centralized here for two reasons. The first is that `??` alone isn't
 * enough: an env var left blank in a hosting provider's dashboard comes
 * through as an empty string, not undefined, which `??` doesn't catch. The
 * second is the one this block is about — a localhost fallback is exactly
 * what you want on a laptop and exactly what you don't want in production,
 * where it produces password-reset links and public quote links that go
 * nowhere.
 */

const DEV_FALLBACK = "http://localhost:3000";

/** Thrown when production can't build a correct absolute URL. */
export class AppUrlNotConfiguredError extends Error {
  constructor(detail: string) {
    super(`NEXT_PUBLIC_APP_URL ${detail}. En producción es obligatoria y debe ser una URL http(s) válida.`);
    this.name = "AppUrlNotConfiguredError";
  }
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
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
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (!raw) {
    // Failing loudly here is the point: a missing variable in production
    // must not quietly become a link to localhost in someone's inbox.
    if (isProduction()) throw new AppUrlNotConfiguredError("no está definida");
    return DEV_FALLBACK;
  }

  const normalized = normalizeAppUrl(raw);
  if (!normalized) {
    if (isProduction()) throw new AppUrlNotConfiguredError("no es una URL válida");
    // On a laptop a typo shouldn't stop the app; it should be visible.
    console.warn("[env] NEXT_PUBLIC_APP_URL no es una URL válida, usando el fallback de desarrollo");
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
