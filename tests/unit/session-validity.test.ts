import { describe, it, expect } from "vitest";
import { isTokenStale } from "@/lib/session-validity";

const CHANGE = new Date("2026-06-15T12:00:00Z");
const changeSeconds = Math.floor(CHANGE.getTime() / 1000);

describe("isTokenStale", () => {
  it("accepts any token when the password was never changed", () => {
    expect(isTokenStale(changeSeconds - 9999, null)).toBe(false);
    expect(isTokenStale(undefined, null)).toBe(false);
  });

  it("rejects a token stamped before the password change", () => {
    expect(isTokenStale(changeSeconds - 1, CHANGE)).toBe(true);
    expect(isTokenStale(changeSeconds - 3600, CHANGE)).toBe(true);
  });

  it("keeps a token stamped after the password change", () => {
    expect(isTokenStale(changeSeconds + 1, CHANGE)).toBe(false);
    expect(isTokenStale(changeSeconds + 3600, CHANGE)).toBe(false);
  });

  it("keeps a token stamped in the same second as the change", () => {
    // Favours not logging out the session the person just created; the
    // exposure for a stolen token is under one second.
    expect(isTokenStale(changeSeconds, CHANGE)).toBe(false);
  });

  it("fails closed for a token with no authAt once a change exists", () => {
    expect(isTokenStale(undefined, CHANGE)).toBe(true);
    expect(isTokenStale(null, CHANGE)).toBe(true);
  });
});
