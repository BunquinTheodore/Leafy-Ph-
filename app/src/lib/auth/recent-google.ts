import { readJwtPayload } from "./jwt-exp";

/** Matches the API: a Google sign in this recent may set a new password without the old one. */
export const RECENT_GOOGLE_SECONDS = 600;

/**
 * A UI hint only, read from our own access token without verifying it. The API makes the real
 * decision when the password is changed, so a stale or forged hint can at worst show the wrong form.
 */
export function isRecentGoogleSignIn(token: string | undefined, nowMs: number): boolean {
  const payload = readJwtPayload(token);
  if (payload?.auth_method !== "google") return false;
  const authTime = payload.auth_time;
  if (typeof authTime !== "number" || !Number.isFinite(authTime)) return false;
  const ageSeconds = nowMs / 1000 - authTime;
  return ageSeconds >= 0 && ageSeconds <= RECENT_GOOGLE_SECONDS;
}
