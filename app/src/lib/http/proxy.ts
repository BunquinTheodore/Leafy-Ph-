import { NextResponse, type NextRequest } from "next/server";
import { errorFromEnvelope, readJson } from "../api/envelope";
import { ApiError } from "../api/errors";
import { authSessionSchema, sessionTokensSchema, type SessionTokens } from "../api/types";
import { clearSessionCookies, cookieNames, setSessionCookies } from "../auth/cookies";
import { isExpiringSoon } from "../auth/jwt-exp";
import { refreshSession, type Refresher } from "../auth/refresh";
import { getEnv, type AppEnv } from "../env";
import { forwardedClientIp } from "./client-ip";
import { assertSameOrigin } from "./csrf";
import { sanitizeNext } from "./safe-redirect";

export const MAX_JSON_BODY_BYTES = 64 * 1024;
/** Allowance for multipart framing on top of the file size cap. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;
const NO_STORE = { "cache-control": "no-store" } as const;
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const PASS_HEADERS = ["content-type", "retry-after", "x-request-id"] as const;
const ACCESS_SKEW_SECONDS = 10;

export interface ProxyDeps {
  env: AppEnv;
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  refresh: Refresher;
  now: () => number;
}

export interface JsonRouteOptions {
  apiPath: string;
  auth?: "required" | "none";
  clearCookiesOnSuccess?: boolean;
  /** Defaults to true for non safe methods. */
  csrf?: boolean;
  /**
   * The API answers with a replacement session (a password change revokes the old ones): store
   * it in the cookies and return only `{ changed: true }` to the browser.
   */
  adoptSession?: boolean;
}

export interface SessionRouteOptions {
  apiPath: string;
}

interface Auth {
  access: string | undefined;
  rotated: SessionTokens | null;
  clear: boolean;
  /** Set when the caller must stop and answer with this error. */
  failure: ApiError | null;
}

function errorResponse(error: ApiError, extraHeaders: Record<string, string> = {}): NextResponse {
  const headers: Record<string, string> = { ...NO_STORE, ...extraHeaders };
  if (error.retryAfterSeconds !== undefined)
    headers["retry-after"] = String(error.retryAfterSeconds);
  return NextResponse.json(
    {
      success: false,
      data: null,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        request_id: error.requestId,
      },
    },
    { status: error.status, headers },
  );
}

const simpleError = (status: number, code: string, message: string) =>
  errorResponse(new ApiError({ status, code, message }));

function isJson(request: Request): boolean {
  return (request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json");
}

export function createProxy(deps: ProxyDeps) {
  const { env } = deps;
  const names = cookieNames(env.cookiePrefix);

  const readCookies = (request: NextRequest) => ({
    access: request.cookies.get(names.access)?.value,
    refresh: request.cookies.get(names.refresh)?.value,
  });

  function finalize(response: NextResponse, auth: Pick<Auth, "rotated" | "clear">): NextResponse {
    if (auth.rotated) setSessionCookies(response.cookies, auth.rotated, env);
    else if (auth.clear) clearSessionCookies(response.cookies, env);
    return response;
  }

  function checkOrigin(request: NextRequest, enforce: boolean): ApiError | null {
    if (!enforce) return null;
    try {
      assertSameOrigin(request, env.appOrigin);
      return null;
    } catch (error) {
      if (error instanceof ApiError) return error;
      throw error;
    }
  }

  /** Makes sure we hold a usable access token, refreshing first when it is missing or stale. */
  async function ensureAuth(request: NextRequest): Promise<Auth> {
    const { access, refresh } = readCookies(request);
    const nowMs = deps.now();
    if (access && !isExpiringSoon(access, nowMs, ACCESS_SKEW_SECONDS)) {
      return { access, rotated: null, clear: false, failure: null };
    }
    const usable = access && !isExpiringSoon(access, nowMs, 0) ? access : undefined;
    if (!refresh) {
      if (usable) return { access: usable, rotated: null, clear: false, failure: null };
      return {
        access: undefined,
        rotated: null,
        clear: false,
        failure: new ApiError({
          status: 401,
          code: "not_authenticated",
          message: "Please sign in to continue.",
        }),
      };
    }
    const result = await deps.refresh(refresh);
    if (result.ok)
      return {
        access: result.session.access_token,
        rotated: result.session,
        clear: false,
        failure: null,
      };
    const definitive = result.status >= 400 && result.status < 500 && result.status !== 429;
    if (definitive) {
      return {
        access: undefined,
        rotated: null,
        clear: true,
        failure: new ApiError({
          status: 401,
          code: result.code,
          message: "Your session has ended. Please sign in again.",
        }),
      };
    }
    if (usable) return { access: usable, rotated: null, clear: false, failure: null };
    return {
      access: undefined,
      rotated: null,
      clear: false,
      failure: new ApiError({
        status: 503,
        code: "api_unreachable",
        message: "We could not reach Leafy right now. Try again in a moment.",
      }),
    };
  }

  function buildHeaders(
    request: NextRequest,
    access: string | undefined,
    extra: Record<string, string>,
  ): Headers {
    const headers = new Headers({
      accept: "application/json",
      "x-request-id": crypto.randomUUID(),
      ...extra,
    });
    if (access) headers.set("authorization", `Bearer ${access}`);
    const clientIp = forwardedClientIp(request.headers, env.trustedProxyHops);
    if (clientIp) headers.set("x-forwarded-for", clientIp);
    return headers;
  }

  async function callApi(url: string, init: RequestInit): Promise<Response | ApiError> {
    try {
      return await deps.fetch(url, { ...init, cache: "no-store" });
    } catch (error) {
      if (error instanceof ApiError) return error;
      if (error instanceof Error && error.message === "UPLOAD_TOO_LARGE") {
        return new ApiError({
          status: 413,
          code: "payload_too_large",
          message: "That photo is too large. Choose a smaller one.",
        });
      }
      return new ApiError({
        status: 503,
        code: "api_unreachable",
        message: "We could not reach Leafy right now. Try again in a moment.",
      });
    }
  }

  function passThrough(upstream: Response, text: string): NextResponse {
    const headers = new Headers(NO_STORE);
    for (const name of PASS_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new NextResponse(text, { status: upstream.status, headers });
  }

  function adoptReplacementSession(upstream: Response, text: string): NextResponse {
    const parsed = sessionTokensSchema.safeParse(parseEnvelopeData(text));
    if (!parsed.success)
      return simpleError(
        502,
        "invalid_response",
        "Leafy sent an unexpected reply. Please sign in again.",
      );
    const response = NextResponse.json(
      { success: true, data: { changed: true }, error: null },
      { status: upstream.status, headers: NO_STORE },
    );
    setSessionCookies(response.cookies, parsed.data, env);
    return response;
  }

  function parseEnvelopeData(text: string): unknown {
    try {
      return (JSON.parse(text) as { data?: unknown } | null)?.data;
    } catch {
      return undefined;
    }
  }

  async function readJsonBody(request: NextRequest): Promise<{ text: string } | ApiError> {
    if (SAFE_METHODS.has(request.method)) return { text: "" };
    const declared = Number.parseInt(request.headers.get("content-length") ?? "0", 10);
    const tooLarge = new ApiError({
      status: 413,
      code: "payload_too_large",
      message: "That request is too large.",
    });
    if (declared > MAX_JSON_BODY_BYTES) return tooLarge;
    const text = await request.text();
    if (text.length > MAX_JSON_BODY_BYTES) return tooLarge;
    if (text.length > 0 && !isJson(request)) {
      return new ApiError({ status: 415, code: "unsupported_media_type", message: "Send JSON." });
    }
    return { text };
  }

  async function forwardJson(
    request: NextRequest,
    options: { apiPath: string; auth: boolean; text: string },
  ) {
    const url = `${env.apiBaseUrl}${options.apiPath}${request.nextUrl.search}`;
    const extra: Record<string, string> = options.text
      ? { "content-type": "application/json" }
      : {};
    const run = (access: string | undefined) =>
      callApi(url, {
        method: request.method,
        headers: buildHeaders(request, access, extra),
        body: options.text || undefined,
      });

    let auth: Auth = { access: undefined, rotated: null, clear: false, failure: null };
    if (options.auth) {
      auth = await ensureAuth(request);
      if (auth.failure) return { auth, result: auth.failure };
    }
    let result = await run(auth.access);
    const { refresh } = readCookies(request);
    if (
      options.auth &&
      !auth.rotated &&
      result instanceof Response &&
      result.status === 401 &&
      refresh
    ) {
      const retry = await deps.refresh(refresh);
      if (retry.ok) {
        auth = {
          access: retry.session.access_token,
          rotated: retry.session,
          clear: false,
          failure: null,
        };
        result = await run(auth.access);
      } else if (retry.status >= 400 && retry.status < 500 && retry.status !== 429) {
        auth = { ...auth, clear: true };
      }
    }
    return { auth, result };
  }

  return {
    /** Generic JSON passthrough for the envelope: `/api/me`, `/api/scans/[id]`, email token routes... */
    async json(request: NextRequest, options: JsonRouteOptions): Promise<NextResponse> {
      const csrfFailure = checkOrigin(request, options.csrf ?? !SAFE_METHODS.has(request.method));
      if (csrfFailure) return errorResponse(csrfFailure);
      const body = await readJsonBody(request);
      if (body instanceof ApiError) return errorResponse(body);

      const { auth, result } = await forwardJson(request, {
        apiPath: options.apiPath,
        auth: options.auth === "required",
        text: body.text,
      });
      if (result instanceof ApiError) return finalize(errorResponse(result), auth);
      const text = await result.text();
      if (result.ok && options.adoptSession) return adoptReplacementSession(result, text);
      const response = passThrough(result, text);
      const success = result.ok && options.clearCookiesOnSuccess === true;
      return finalize(response, success ? { rotated: null, clear: true } : auth);
    },

    /** Login, register: stores the tokens in cookies and returns only the user to the browser. */
    async session(request: NextRequest, options: SessionRouteOptions): Promise<NextResponse> {
      const csrfFailure = checkOrigin(request, true);
      if (csrfFailure) return errorResponse(csrfFailure);
      const body = await readJsonBody(request);
      if (body instanceof ApiError) return errorResponse(body);

      const { result } = await forwardJson(request, {
        apiPath: options.apiPath,
        auth: false,
        text: body.text,
      });
      if (result instanceof ApiError) return errorResponse(result);
      const payload = await readJson(result);
      if (!result.ok) return errorResponse(errorFromEnvelope(result.status, payload, result));
      const parsed = authSessionSchema.safeParse((payload as { data?: unknown } | null)?.data);
      if (!parsed.success)
        return simpleError(
          502,
          "invalid_response",
          "Leafy sent an unexpected reply. Please try again.",
        );
      const response = NextResponse.json(
        { success: true, data: { user: parsed.data.user }, error: null },
        { status: result.status, headers: NO_STORE },
      );
      setSessionCookies(response.cookies, parsed.data, env);
      return response;
    },

    /** Streams a multipart upload to the API without buffering it. */
    async upload(request: NextRequest, options: { apiPath: string }): Promise<NextResponse> {
      const csrfFailure = checkOrigin(request, true);
      if (csrfFailure) return errorResponse(csrfFailure);

      const contentType = request.headers.get("content-type") ?? "";
      if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
        return simpleError(415, "unsupported_media_type", "Upload the photo as a file.");
      }
      const declared = Number.parseInt(request.headers.get("content-length") ?? "", 10);
      if (!Number.isFinite(declared) || declared <= 0) {
        return simpleError(
          411,
          "validation_error",
          "We could not tell how large that upload is. Try again.",
        );
      }
      const limit = env.maxUploadBytes + MULTIPART_OVERHEAD_BYTES;
      if (declared > limit || !request.body) {
        return simpleError(
          413,
          "payload_too_large",
          "That photo is too large. Choose a smaller one.",
        );
      }

      // A stream cannot be replayed, so refresh before sending instead of retrying after a 401.
      const auth = await ensureAuth(request);
      if (auth.failure) return finalize(errorResponse(auth.failure), auth);

      const result = await callApi(`${env.apiBaseUrl}${options.apiPath}`, {
        method: "POST",
        headers: buildHeaders(request, auth.access, {
          "content-type": contentType,
          "content-length": String(declared),
        }),
        body: request.body.pipeThrough(byteLimit(limit)),
        // Node fetch needs half duplex to stream a request body.
        duplex: "half",
      } as RequestInit);
      if (result instanceof ApiError) return finalize(errorResponse(result), auth);
      return finalize(passThrough(result, await result.text()), auth);
    },

    async logout(request: NextRequest): Promise<NextResponse> {
      const csrfFailure = checkOrigin(request, true);
      if (csrfFailure) return errorResponse(csrfFailure);
      const { refresh } = readCookies(request);
      if (refresh) {
        await callApi(`${env.apiBaseUrl}/auth/logout`, {
          method: "POST",
          headers: buildHeaders(request, undefined, { "content-type": "application/json" }),
          body: JSON.stringify({ refresh_token: refresh }),
        });
      }
      const response = NextResponse.json(
        { success: true, data: { ok: true }, error: null },
        { headers: NO_STORE },
      );
      clearSessionCookies(response.cookies, env);
      return response;
    },

    /** POST answers JSON for the browser; GET is the RSC fallback and redirects back to `next`. */
    async refreshRoute(request: NextRequest): Promise<NextResponse> {
      const isGet = request.method === "GET";
      if (!isGet) {
        const csrfFailure = checkOrigin(request, true);
        if (csrfFailure) return errorResponse(csrfFailure);
      }
      const next = sanitizeNext(request.nextUrl.searchParams.get("next"));
      const { refresh } = readCookies(request);
      const result = refresh ? await deps.refresh(refresh) : null;

      if (result?.ok) {
        const response = isGet
          ? NextResponse.redirect(new URL(next, env.appOrigin))
          : NextResponse.json(
              { success: true, data: { ok: true }, error: null },
              { headers: NO_STORE },
            );
        setSessionCookies(response.cookies, result.session, env);
        response.headers.set("cache-control", "no-store");
        return response;
      }
      const code = result && !result.ok ? result.code : "not_authenticated";
      const response = isGet
        ? NextResponse.redirect(loginUrl(env, next))
        : simpleError(401, code, "Your session has ended. Please sign in again.");
      const definitive = !result || (!result.ok && result.status < 500);
      if (definitive) clearSessionCookies(response.cookies, env);
      return response;
    },
  };
}

function loginUrl(env: AppEnv, next: string): URL {
  const url = new URL("/login", env.appOrigin);
  url.searchParams.set("reason", "session_expired");
  const safe = sanitizeNext(next, "");
  if (safe) url.searchParams.set("next", safe);
  return url;
}

/** Fails the stream once more than `maxBytes` have flowed through (defence beyond Content-Length). */
function byteLimit(maxBytes: number): TransformStream<Uint8Array, Uint8Array> {
  let seen = 0;
  return new TransformStream({
    transform(chunk, controller) {
      seen += chunk.byteLength;
      if (seen > maxBytes) throw new Error("UPLOAD_TOO_LARGE");
      controller.enqueue(chunk);
    },
  });
}

let defaultProxy: ReturnType<typeof createProxy> | undefined;

/** Process wide proxy wired to the real fetch and environment. */
export function getProxy(): ReturnType<typeof createProxy> {
  defaultProxy ??= createProxy({
    env: getEnv(),
    fetch: (input, init) => fetch(input, init),
    refresh: refreshSession,
    now: () => Date.now(),
  });
  return defaultProxy;
}
