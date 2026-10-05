import type { AppEnv } from "../env";
import type { SessionTokens } from "../api/types";

export const ACCESS_MAX_AGE_SECONDS = 900;
export const REFRESH_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
}

/** The slice of NextResponse.cookies / request cookie stores that we write through. */
export interface CookieWriter {
  set(name: string, value: string, options: CookieOptions): unknown;
}

type CookieEnv = Pick<AppEnv, "cookieSecure" | "cookiePrefix">;

export function cookieNames(prefix: string) {
  return {
    access: `${prefix}leafy_at`,
    refresh: `${prefix}leafy_rt`,
  } as const;
}

export function cookieOptions(env: CookieEnv, maxAge: number): CookieOptions {
  // Lax, not Strict: Strict would drop the session when arriving from email links.
  return { httpOnly: true, secure: env.cookieSecure, sameSite: "lax", path: "/", maxAge };
}

export function setSessionCookies(
  writer: CookieWriter,
  session: Pick<SessionTokens, "access_token" | "refresh_token">,
  env: CookieEnv,
): void {
  const names = cookieNames(env.cookiePrefix);
  writer.set(names.access, session.access_token, cookieOptions(env, ACCESS_MAX_AGE_SECONDS));
  writer.set(names.refresh, session.refresh_token, cookieOptions(env, REFRESH_MAX_AGE_SECONDS));
}

export function clearSessionCookies(writer: CookieWriter, env: CookieEnv): void {
  const names = cookieNames(env.cookiePrefix);
  writer.set(names.access, "", cookieOptions(env, 0));
  writer.set(names.refresh, "", cookieOptions(env, 0));
}
