import { headers } from "next/headers";

/**
 * Best-effort client IP for rate-limiting keys. Behind Vercel's proxy the
 * real address arrives in `x-forwarded-for` (first entry) or `x-real-ip`.
 *
 * This is a throttling key, not an identity: a shared NAT makes several
 * people look like one, and it can be spoofed if the app is ever run
 * without a trusted proxy in front. That's why per-account limits exist
 * alongside the per-IP ones rather than relying on IP alone.
 */
export async function getRequestIp(): Promise<string> {
  try {
    const headerList = await headers();
    const forwarded = headerList.get("x-forwarded-for");
    if (forwarded) {
      const first = forwarded.split(",")[0]?.trim();
      if (first) return first;
    }
    return headerList.get("x-real-ip") ?? "unknown";
  } catch {
    // headers() throws outside a request scope (e.g. in tests).
    return "unknown";
  }
}
