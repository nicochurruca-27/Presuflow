/**
 * Server-side error logging that can't leak a secret.
 *
 * Two things make a raw `console.error(err)` risky here. Prisma puts the
 * failing query — including its arguments — into the error message, so a
 * failed `user.create` prints the password hash it was trying to write. And
 * an HTTP client's error object can carry the request it made, headers
 * included. Neither is hypothetical and neither is obvious at the call site,
 * so the safe version lives in one place and the call sites use it.
 *
 * This is not an observability system and isn't trying to be one. Errors
 * still reach the server log with enough detail to debug; what they don't
 * carry is credentials.
 */

const REDACTED = "[REDACTADO]";

/** Env vars whose *values* must never appear in a log line. */
const SECRET_ENV_VARS = [
  "AUTH_SECRET",
  "NEXTAUTH_SECRET",
  "DATABASE_URL",
  "EMAIL_API_KEY",
  "AI_API_KEY",
  "STRIPE_SECRET_KEY",
  "MERCADOPAGO_ACCESS_TOKEN",
] as const;

/**
 * Field names that carry a secret when they appear as `name: "value"` or
 * `name=value` in an error message.
 */
const SENSITIVE_FIELDS =
  "password|passwordHash|token|resetToken|apiKey|api_key|authorization|cookie|secret|sessionToken";

/**
 * Masks anything that looks like a credential.
 *
 * Exact secret values go first — if the real key is in the text, nothing
 * else needs to be clever about it. Then the `field: value` patterns, for
 * the ones we can't know by value, like a per-row password hash or a
 * one-time reset token.
 */
export function redactSecrets(text: string): string {
  let output = text;

  for (const name of SECRET_ENV_VARS) {
    const value = process.env[name];
    // Very short values would match everywhere and turn the log to noise.
    if (value && value.length >= 8) {
      output = output.split(value).join(REDACTED);
    }
  }

  // name: "value" / name: 'value'
  output = output.replace(
    new RegExp(`("?(?:${SENSITIVE_FIELDS})"?\\s*[:=]\\s*)(["'])(?:\\\\.|(?!\\2).)*\\2`, "gi"),
    `$1$2${REDACTED}$2`
  );
  // name=value in a URL or query string
  output = output.replace(
    new RegExp(`\\b((?:${SENSITIVE_FIELDS})=)[^&\\s"']+`, "gi"),
    `$1${REDACTED}`
  );
  // Credentials embedded in a connection string or URL.
  output = output.replace(/(\b[a-z][a-z0-9+.-]*:\/\/[^:/\s]+:)[^@\s]+@/gi, `$1${REDACTED}@`);

  return output;
}

export interface ErrorSummary {
  name: string;
  message: string;
  code?: string;
}

/**
 * Reduces any thrown value to the fields worth logging, redacted.
 *
 * Never the whole object: that's where request bodies, headers and Prisma's
 * query arguments live.
 */
export function describeError(err: unknown): ErrorSummary {
  if (err instanceof Error) {
    const code = (err as { code?: unknown }).code;
    return {
      name: err.name,
      message: redactSecrets(err.message),
      ...(typeof code === "string" ? { code } : {}),
    };
  }
  // Not every provider throws an Error: Resend, for one, reports failures as
  // a plain { name, message } object in the response body.
  if (err && typeof err === "object") {
    const candidate = err as { name?: unknown; message?: unknown; statusCode?: unknown };
    if (typeof candidate.message === "string") {
      return {
        name: typeof candidate.name === "string" ? candidate.name : "ProviderError",
        message: redactSecrets(candidate.message),
        ...(typeof candidate.statusCode === "number" ? { code: String(candidate.statusCode) } : {}),
      };
    }
  }

  return { name: "UnknownError", message: redactSecrets(String(err)) };
}

/** The one way this app logs a caught error. */
export function logError(scope: string, err: unknown, extra?: Record<string, unknown>): void {
  console.error(`[${scope}]`, { ...describeError(err), ...(extra ?? {}) });
}
