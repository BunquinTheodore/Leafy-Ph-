import { clearSessionCookies, cookieNames, setSessionCookies } from "../auth/cookies";
import { refreshSession, type RefreshResult, type Refresher } from "../auth/refresh";
import { getEnv } from "../env";
import { sanitizeNext } from "../http/safe-redirect";
import { errorFromEnvelope, parseEnvelope, readJson } from "./envelope";
import { ApiError } from "./errors";
import type { SessionTokens } from "./types";

export interface ApiFetchDeps {
  apiBaseUrl: string;
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  readTokens: () => Promise<{ access: string | undefined; refresh: string | undefined }>;
  writeTokens: (session: SessionTokens) => Promise<void>;
  clearTokens: () => Promise<void>;
  refresh: Refresher;
  /** next/navigation redirect: must never return. */
  redirect: (url: string) => never;
  requestId: () => string;
}

export interface ApiFetchOptions {
  method?: string;
  /** JSON body, serialised with a content type. */
  json?: unknown;
  body?: BodyInit;
  headers?: Record<string, string>;
  /** Attach the bearer token and handle 401. Defaults to true. */
  auth?: boolean;
  /** True in route handlers and server actions, where cookies can be written. */
  mutable?: boolean;
  /** Where to return after the RSC refresh redirect. */
  next?: string;
  signal?: AbortSignal;
}

const NOT_AUTHENTICATED = new ApiError({
  status: 401,
  code: "not_authenticated",
  message: "Please sign in to continue.",
});

const unreachable = () =>
  new ApiError({
    status: 503,
    code: "api_unreachable",
    message: "We could not reach Leafy right now. Check your connection and try again.",
  });

/** Builds the server side API caller. Dependencies are injected so it is easy to test. */
export function createApiFetch(deps: ApiFetchDeps) {
  async function send(
    path: string,
    options: ApiFetchOptions,
    access: string | undefined,
  ): Promise<Response> {
    const headers = new Headers(options.headers);
    headers.set("accept", "application/json");
    headers.set("x-request-id", deps.requestId());
    if (access) headers.set("authorization", `Bearer ${access}`);
    let body = options.body;
    if (options.json !== undefined) {
      headers.set("content-type", "application/json");
      body = JSON.stringify(options.json);
    }
    try {
      return await deps.fetch(`${deps.apiBaseUrl}${path}`, {
        method: options.method ?? "GET",
        headers,
        body,
        signal: options.signal,
        cache: "no-store",
      });
    } catch {
      throw unreachable();
    }
  }

  async function refreshAndRetry<T>(
    path: string,
    options: ApiFetchOptions,
    refresh: string,
  ): Promise<T> {
    const result: RefreshResult = await deps.refresh(refresh);
    if (!result.ok) {
      if (result.status >= 400 && result.status < 500 && result.status !== 429)
        await deps.clearTokens();
      throw new ApiError({
        status: result.status,
        code: result.code,
        message: "Your session has ended. Please sign in again.",
      });
    }
    await deps.writeTokens(result.session);
    return parseEnvelope<T>(await send(path, options, result.session.access_token));
  }

  return async function apiFetch<T = unknown>(
    path: string,
    options: ApiFetchOptions = {},
  ): Promise<T> {
    if (options.auth === false) return parseEnvelope<T>(await send(path, options, undefined));

    const { access, refresh } = await deps.readTokens();
    const first = access ? await send(path, options, access) : null;
    if (first?.ok) return parseEnvelope<T>(first);
    if (first && first.status !== 401)
      throw errorFromEnvelope(first.status, await readJson(first), first);

    if (!refresh) {
      if (first) throw errorFromEnvelope(401, await readJson(first), first);
      throw NOT_AUTHENTICATED;
    }
    if (!options.mutable) {
      const target = sanitizeNext(options.next ?? "/", "/");
      return deps.redirect(`/api/auth/refresh?next=${encodeURIComponent(target)}`);
    }
    return refreshAndRetry<T>(path, options, refresh);
  };
}

async function defaultDeps(): Promise<ApiFetchDeps> {
  const env = getEnv();
  const { cookies } = await import("next/headers");
  const { redirect } = await import("next/navigation");
  const names = cookieNames(env.cookiePrefix);
  return {
    apiBaseUrl: env.apiBaseUrl,
    fetch: (input, init) => fetch(input, init),
    readTokens: async () => {
      const jar = await cookies();
      return { access: jar.get(names.access)?.value, refresh: jar.get(names.refresh)?.value };
    },
    writeTokens: async (session) => setSessionCookies(await cookies(), session, env),
    clearTokens: async () => clearSessionCookies(await cookies(), env),
    refresh: refreshSession,
    redirect,
    requestId: () => crypto.randomUUID(),
  };
}

/** Server only: authenticated call to the FastAPI service, returning the unwrapped `data`. */
export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  return createApiFetch(await defaultDeps())<T>(path, options);
}
