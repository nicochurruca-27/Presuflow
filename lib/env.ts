/**
 * Public base URL of the app, used to build absolute links (emails, quote
 * links, sitemap, metadata). Centralized here because `??` alone isn't
 * enough: an env var left blank in a hosting provider's dashboard often
 * comes through as an empty string, not undefined, which `??` doesn't catch.
 */
export function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}
