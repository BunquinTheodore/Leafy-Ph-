import type { SessionTokens } from "../api/types";
import { isExpiringSoon } from "./jwt-exp";
import type { Refresher } from "./refresh";

export interface RawTokens {
  access: string | undefined;
  refresh: string | undefined;
}

export interface SessionResolution {
  authenticated: boolean;
  /** New tokens to persist (cookies on the request and the response), when a refresh happened. */
  rotated: SessionTokens | null;
  /** True when the refresh token was rejected and the cookies must be cleared. */
  clear: boolean;
}

export interface ResolveDeps {
  refresh: Refresher;
  now: () => number;
}

const isDefinitiveRejection = (status: number) => status >= 400 && status < 500 && status !== 429;

/**
 * Decides whether the visitor is signed in, refreshing proactively when the access token is
 * missing or within 30s of expiry. Transient API failures never sign anyone out.
 */
export async function resolveSession(
  tokens: RawTokens,
  deps: ResolveDeps,
): Promise<SessionResolution> {
  const nowMs = deps.now();
  const stillUsable = !isExpiringSoon(tokens.access, nowMs, 0);

  if (tokens.access && !isExpiringSoon(tokens.access, nowMs)) {
    return { authenticated: true, rotated: null, clear: false };
  }
  if (!tokens.refresh) {
    return { authenticated: stillUsable, rotated: null, clear: false };
  }

  const result = await deps.refresh(tokens.refresh);
  if (result.ok) return { authenticated: true, rotated: result.session, clear: false };
  if (isDefinitiveRejection(result.status))
    return { authenticated: false, rotated: null, clear: true };
  return { authenticated: stillUsable, rotated: null, clear: false };
}
