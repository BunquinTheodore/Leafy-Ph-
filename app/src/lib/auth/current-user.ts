import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { apiFetch } from "../api/client";
import type { UserOut } from "../api/types";
import { getEnv } from "../env";
import { cookieNames } from "./cookies";
import { resolveMe, type MeResult } from "./me";

/** One GET /users/me per request, shared by the header, bottom nav and protected layout. */
const loadMe = cache(async (): Promise<MeResult> => {
  const names = cookieNames(getEnv().cookiePrefix);
  const jar = await cookies();
  const hasCookies = Boolean(jar.get(names.access)?.value || jar.get(names.refresh)?.value);
  return resolveMe(hasCookies, () => apiFetch("/users/me"));
});

/** For public chrome (header, bottom nav): the signed in user, or null for guests and failures. */
export async function getSessionUser(): Promise<UserOut | null> {
  const result = await loadMe();
  return result.kind === "user" ? result.user : null;
}

/**
 * For protected routes. A missing or ended session goes to sign in; a temporary API failure
 * throws to the nearest error boundary, which offers a retry.
 */
export async function requireUser(): Promise<UserOut> {
  const result = await loadMe();
  switch (result.kind) {
    case "user":
      return result.user;
    case "guest":
      return redirect("/login");
    case "expired":
      return redirect("/login?reason=session_expired");
    case "error":
    case "control":
      throw result.error;
  }
}
