import { describe, expect, it } from "vitest";
import { isRecentGoogleSignIn, RECENT_GOOGLE_SECONDS } from "./recent-google";

const NOW_MS = 1_800_000_000_000;
const NOW_S = NOW_MS / 1000;

function token(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `h.${body}.s`;
}

describe("isRecentGoogleSignIn", () => {
  it("uses a ten minute window", () => {
    expect(RECENT_GOOGLE_SECONDS).toBe(600);
  });

  it("is true for a Google session signed in a minute ago", () => {
    const t = token({ auth_method: "google", auth_time: NOW_S - 60 });
    expect(isRecentGoogleSignIn(t, NOW_MS)).toBe(true);
  });

  it("is false once the sign in is older than the window", () => {
    const t = token({ auth_method: "google", auth_time: NOW_S - RECENT_GOOGLE_SECONDS - 1 });
    expect(isRecentGoogleSignIn(t, NOW_MS)).toBe(false);
  });

  it("is false for a password session", () => {
    const t = token({ auth_method: "password", auth_time: NOW_S - 5 });
    expect(isRecentGoogleSignIn(t, NOW_MS)).toBe(false);
  });

  it("is false for a missing, malformed or claimless token", () => {
    expect(isRecentGoogleSignIn(undefined, NOW_MS)).toBe(false);
    expect(isRecentGoogleSignIn("nope", NOW_MS)).toBe(false);
    expect(isRecentGoogleSignIn(token({ auth_method: "google" }), NOW_MS)).toBe(false);
  });

  it("is false for an auth_time in the future", () => {
    const t = token({ auth_method: "google", auth_time: NOW_S + 3600 });
    expect(isRecentGoogleSignIn(t, NOW_MS)).toBe(false);
  });
});
