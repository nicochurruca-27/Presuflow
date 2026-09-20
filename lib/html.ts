/**
 * Escaping for the HTML we build by hand.
 *
 * The only place this is needed is the transactional emails: the app's own
 * pages are React, which escapes interpolated values for us. Email templates
 * are plain template strings, so every value that comes from a user or from
 * the database has to be escaped on the way in — a customer named
 * `<script>…` would otherwise be markup, not text.
 *
 * This is not a sanitizer and isn't meant to be one. We never accept HTML
 * from anybody; we write the markup ourselves and interpolate escaped text
 * into it, which is the safe half of the problem and needs no dependency.
 */

const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Escapes text for use in HTML, including inside a quoted attribute.
 *
 * `&` is handled by the same pass as the rest (a single regex), so an
 * already-escaped entity can't be double-escaped by ordering mistakes.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"']/g, (char) => HTML_ENTITIES[char]);
}

/** Protocols allowed in a link we render. Everything else is a vector. */
const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/**
 * Prepares a URL for an `href`.
 *
 * Escaping alone doesn't make a link safe: `javascript:alert(1)` contains no
 * character that escaping touches. So the protocol is checked first, and
 * anything unrecognised becomes "#" rather than a working link. Every URL we
 * put in an email is built by us from the app's base URL, so this is a
 * second line of defence — but it's the line that would matter if a URL ever
 * started carrying user input.
 */
export function safeUrl(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "#";

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return "#";
  }

  if (!SAFE_PROTOCOLS.has(parsed.protocol)) return "#";
  return escapeHtml(parsed.toString());
}
