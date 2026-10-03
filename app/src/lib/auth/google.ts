import { NextResponse, type NextRequest } from "next/server";
import { authSessionSchema } from "../api/types";
import { readJson } from "../api/envelope";
import { getEnv, type AppEnv } from "../env";
import { sanitizeNext } from "../http/safe-redirect";
import { clearOauthCookie, cookieNames, setOauthCookie, setSessionCookies } from "./cookies";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const MOCK_CODE = "mock-code";
const PASS_THROUGH_ERRORS = new Set([
  "google_email_unverified",
  "google_auth_failed",
  "rate_limited",
]);
const RANDOM_BYTES = 32;

export interface GoogleFlowDeps {
  env: AppEnv;
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

interface OauthState {
  state: string;
  nonce: string;
  verifier: string;
  next: string;
}

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const randomToken = (): string => toBase64Url(crypto.getRandomValues(new Uint8Array(RANDOM_BYTES)));

/** PKCE S256 code challenge for a verifier. */
export async function codeChallengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return toBase64Url(new Uint8Array(digest));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function encodeState(value: OauthState): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function decodeState(raw: string | undefined): OauthState | null {
  if (!raw) return null;
  try {
    const base64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    const json = new TextDecoder().decode(
      Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")), (c) =>
        c.charCodeAt(0),
      ),
    );
    const value = JSON.parse(json) as Partial<OauthState>;
    const { state, nonce, verifier, next } = value;
    if (
      typeof state === "string" &&
      typeof nonce === "string" &&
      typeof verifier === "string" &&
      typeof next === "string"
    ) {
      return { state, nonce, verifier, next };
    }
    return null;
  } catch {
    return null;
  }
}

/** The two browser legs of Google sign in. Code exchange and ID token checks live in the API. */
export function createGoogleFlow({ env, fetch: doFetch }: GoogleFlowDeps) {
  const oauthCookie = cookieNames(env.cookiePrefix).oauth;

  const toLogin = (error: string): NextResponse => {
    const url = new URL("/login", env.appOrigin);
    url.searchParams.set("error", error);
    const response = NextResponse.redirect(url);
    clearOauthCookie(response.cookies, env);
    response.headers.set("cache-control", "no-store");
    return response;
  };

  return {
    async start(request: NextRequest): Promise<NextResponse> {
      if (!env.googleMock && !env.googleClientId) return toLogin("google_unavailable");

      const stored: OauthState = {
        state: randomToken(),
        nonce: randomToken(),
        verifier: randomToken(),
        next: sanitizeNext(request.nextUrl.searchParams.get("next")),
      };

      let target: URL;
      if (env.googleMock) {
        target = new URL("/api/auth/google/callback", env.appOrigin);
        target.searchParams.set("code", MOCK_CODE);
        target.searchParams.set("state", stored.state);
      } else {
        target = new URL(GOOGLE_AUTH_URL);
        target.searchParams.set("client_id", env.googleClientId);
        target.searchParams.set("redirect_uri", env.googleRedirectUri);
        target.searchParams.set("response_type", "code");
        target.searchParams.set("scope", "openid email profile");
        target.searchParams.set("state", stored.state);
        target.searchParams.set("nonce", stored.nonce);
        target.searchParams.set("code_challenge", await codeChallengeFor(stored.verifier));
        target.searchParams.set("code_challenge_method", "S256");
        target.searchParams.set("prompt", "select_account");
      }
      const response = NextResponse.redirect(target);
      setOauthCookie(response.cookies, encodeState(stored), env);
      response.headers.set("cache-control", "no-store");
      return response;
    },

    async callback(request: NextRequest): Promise<NextResponse> {
      const params = request.nextUrl.searchParams;
      const stored = decodeState(request.cookies.get(oauthCookie)?.value);
      const returnedState = params.get("state") ?? "";
      if (!stored || !safeEqual(stored.state, returnedState)) return toLogin("invalid_state");

      const providerError = params.get("error");
      if (providerError)
        return toLogin(
          providerError === "access_denied" ? "google_cancelled" : "google_auth_failed",
        );
      const code = params.get("code");
      if (!code) return toLogin("google_auth_failed");

      let upstream: Response;
      try {
        upstream = await doFetch(`${env.apiBaseUrl}/auth/google`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
            "x-request-id": crypto.randomUUID(),
          },
          body: JSON.stringify({
            code,
            code_verifier: stored.verifier,
            nonce: stored.nonce,
            redirect_uri: env.googleRedirectUri,
          }),
          cache: "no-store",
        });
      } catch {
        return toLogin("google_auth_failed");
      }
      const payload = (await readJson(upstream)) as {
        data?: unknown;
        error?: { code?: string };
      } | null;
      if (!upstream.ok) {
        const apiCode = payload?.error?.code ?? "";
        return toLogin(PASS_THROUGH_ERRORS.has(apiCode) ? apiCode : "google_auth_failed");
      }
      const session = authSessionSchema.safeParse(payload?.data);
      if (!session.success) return toLogin("google_auth_failed");

      // Only the value stored before the redirect is trusted, never a `next` on the callback URL.
      const response = NextResponse.redirect(new URL(sanitizeNext(stored.next), env.appOrigin));
      setSessionCookies(response.cookies, session.data, env);
      clearOauthCookie(response.cookies, env);
      response.headers.set("cache-control", "no-store");
      return response;
    },
  };
}

let defaultFlow: ReturnType<typeof createGoogleFlow> | undefined;

/** Process wide flow wired to the real fetch and environment. */
export function getGoogleFlow(): ReturnType<typeof createGoogleFlow> {
  defaultFlow ??= createGoogleFlow({ env: getEnv(), fetch: (input, init) => fetch(input, init) });
  return defaultFlow;
}
