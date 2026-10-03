import { readJson } from "../api/envelope";
import { sessionTokensSchema, type SessionTokens } from "../api/types";
import { getEnv } from "../env";

export const REFRESH_RETENTION_MS = 15_000;

export type RefreshResult =
  { ok: true; session: SessionTokens } | { ok: false; status: number; code: string };

export type Refresher = (refreshToken: string) => Promise<RefreshResult>;

export interface RefresherDeps {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  apiBaseUrl: string;
  now?: () => number;
  retentionMs?: number;
}

/** Hex sha256, used as the single flight key so raw refresh tokens never sit in the map. */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Definitive answers are safe to reuse; network and 5xx failures must be retried. */
function isDefinitive(result: RefreshResult): boolean {
  if (result.ok) return true;
  return result.status >= 400 && result.status < 500 && result.status !== 429;
}

interface Entry {
  promise: Promise<RefreshResult>;
  settledAt: number | null;
}

async function callRefresh(deps: RefresherDeps, refreshToken: string): Promise<RefreshResult> {
  let response: Response;
  try {
    response = await deps.fetch(`${deps.apiBaseUrl}/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: 503, code: "api_unreachable" };
  }
  const body = (await readJson(response)) as { data?: unknown; error?: { code?: string } } | null;
  if (!response.ok) {
    return { ok: false, status: response.status, code: body?.error?.code ?? "refresh_invalid" };
  }
  const parsed = sessionTokensSchema.safeParse(body?.data);
  if (!parsed.success) return { ok: false, status: 502, code: "invalid_response" };
  return { ok: true, session: parsed.data };
}

/**
 * Single flight refresh keyed by the sha256 of the refresh token. Concurrent callers share one
 * request and the settled result is kept for 15s so late arrivals with the same (now rotated)
 * token get the same new session instead of tripping reuse detection.
 */
export function createRefresher(deps: RefresherDeps): Refresher {
  const entries = new Map<string, Entry>();
  const now = deps.now ?? Date.now;
  const retention = deps.retentionMs ?? REFRESH_RETENTION_MS;

  const prune = (at: number) => {
    for (const [key, entry] of entries) {
      if (entry.settledAt !== null && at - entry.settledAt >= retention) entries.delete(key);
    }
  };

  return async (refreshToken) => {
    const key = await hashToken(refreshToken);
    prune(now());
    const existing = entries.get(key);
    if (existing) return existing.promise;

    const entry: Entry = { promise: callRefresh(deps, refreshToken), settledAt: null };
    entries.set(key, entry);
    void entry.promise.then((result) => {
      if (isDefinitive(result)) entry.settledAt = now();
      else entries.delete(key);
    });
    return entry.promise;
  };
}

let defaultRefresher: Refresher | undefined;

/** Process wide refresher used by middleware, route handlers and apiFetch. */
export const refreshSession: Refresher = (refreshToken) => {
  defaultRefresher ??= createRefresher({
    fetch: (input, init) => fetch(input, init),
    apiBaseUrl: getEnv().apiBaseUrl,
  });
  return defaultRefresher(refreshToken);
};
