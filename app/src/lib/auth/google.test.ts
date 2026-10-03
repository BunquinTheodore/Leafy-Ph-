// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { createMockFetch, fail, mockSession, ok } from "../../../tests/mocks/api";
import { parseEnv } from "../env";
import { codeChallengeFor, createGoogleFlow } from "./google";

const ORIGIN = "http://localhost:3000";
const baseEnv = {
  API_INTERNAL_URL: "http://api.test",
  APP_ORIGIN: ORIGIN,
  GOOGLE_CLIENT_ID: "client-123",
};
const env = parseEnv(baseEnv);

function get(path: string, cookie?: string) {
  return new NextRequest(`${ORIGIN}${path}`, { headers: cookie ? { cookie } : {} });
}

function oauthCookieFrom(res: Response): string {
  const raw = res.headers.getSetCookie().find((c) => c.startsWith("leafy_oauth="));
  expect(raw).toBeDefined();
  return (raw ?? "").split(";")[0] ?? "";
}

describe("codeChallengeFor", () => {
  it("matches the RFC 7636 example", async () => {
    expect(await codeChallengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });
});

describe("google start", () => {
  it("redirects to Google with state, nonce, PKCE S256 and the right scope", async () => {
    const flow = createGoogleFlow({ env, fetch: createMockFetch({}) });
    const res = await flow.start(get("/api/auth/google?next=/scan"));
    expect(res.status).toBe(307);
    const url = new URL(res.headers.get("location") ?? "");
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("client-123");
    expect(url.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/api/auth/google/callback`);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("prompt")).toBe("select_account");
    expect(url.searchParams.get("state")?.length).toBeGreaterThanOrEqual(32);
    expect(url.searchParams.get("nonce")?.length).toBeGreaterThanOrEqual(32);
    expect(url.searchParams.get("code_challenge")?.length).toBeGreaterThanOrEqual(43);
    const set = res.headers.getSetCookie().find((c) => c.startsWith("leafy_oauth=")) ?? "";
    expect(set.toLowerCase()).toContain("httponly");
    expect(set.toLowerCase()).toContain("samesite=lax");
    expect(set).toContain("Max-Age=600");
  });

  it("uses the __Host- prefix and Secure in production", async () => {
    const prod = parseEnv({ ...baseEnv, COOKIE_PREFIX: "__Host-", COOKIE_SECURE: "true" });
    const res = await createGoogleFlow({ env: prod, fetch: createMockFetch({}) }).start(
      get("/api/auth/google"),
    );
    const set = res.headers.getSetCookie().find((c) => c.startsWith("__Host-leafy_oauth=")) ?? "";
    expect(set).toContain("Secure");
    expect(set).toContain("Path=/");
  });

  it("goes to login with an error when Google is not configured", async () => {
    const none = parseEnv({ API_INTERNAL_URL: "http://api.test", APP_ORIGIN: ORIGIN });
    const res = await createGoogleFlow({ env: none, fetch: createMockFetch({}) }).start(
      get("/api/auth/google"),
    );
    expect(new URL(res.headers.get("location") ?? "").searchParams.get("error")).toBe(
      "google_unavailable",
    );
  });

  it("in mock mode loops straight back to the callback", async () => {
    const mock = parseEnv({ ...baseEnv, GOOGLE_CLIENT_ID: "", GOOGLE_MOCK: "1" });
    const res = await createGoogleFlow({ env: mock, fetch: createMockFetch({}) }).start(
      get("/api/auth/google"),
    );
    const url = new URL(res.headers.get("location") ?? "");
    expect(url.pathname).toBe("/api/auth/google/callback");
    expect(url.searchParams.get("code")).toBe("mock-code");
    expect(url.searchParams.get("state")).toBeTruthy();
  });
});

async function startAndGetState(flow: ReturnType<typeof createGoogleFlow>, next = "/scan") {
  const res = await flow.start(get(`/api/auth/google?next=${encodeURIComponent(next)}`));
  const state = new URL(res.headers.get("location") ?? "").searchParams.get("state") ?? "";
  return { state, cookie: oauthCookieFrom(res) };
}

describe("google callback", () => {
  it("exchanges the code via the API, sets session cookies and redirects to next", async () => {
    let apiBody: Record<string, string> = {};
    const fetchMock = createMockFetch({
      "POST /auth/google": ({ body }) => {
        apiBody = JSON.parse(body ?? "{}") as Record<string, string>;
        return ok(mockSession());
      },
    });
    const flow = createGoogleFlow({ env, fetch: fetchMock });
    const { state, cookie } = await startAndGetState(flow, "/scan");
    const res = await flow.callback(
      get(`/api/auth/google/callback?code=abc&state=${state}`, cookie),
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/scan`);
    const cookies = res.headers.getSetCookie().join("\n");
    expect(cookies).toContain("leafy_at=");
    expect(cookies).toContain("leafy_rt=rt-new");
    expect(cookies).toMatch(/leafy_oauth=;/);
    expect(apiBody.code).toBe("abc");
    expect(apiBody.redirect_uri).toBe(`${ORIGIN}/api/auth/google/callback`);
    expect(apiBody.code_verifier?.length).toBeGreaterThanOrEqual(43);
    expect(apiBody.nonce?.length).toBeGreaterThanOrEqual(32);
  });

  it("rejects a state mismatch without calling the API", async () => {
    const fetchMock = createMockFetch({ "POST /auth/google": () => ok(mockSession()) });
    const flow = createGoogleFlow({ env, fetch: fetchMock });
    const { cookie } = await startAndGetState(flow);
    const res = await flow.callback(get("/api/auth/google/callback?code=abc&state=forged", cookie));
    expect(new URL(res.headers.get("location") ?? "").searchParams.get("error")).toBe(
      "invalid_state",
    );
    expect(fetchMock.calls).toHaveLength(0);
    expect(res.headers.getSetCookie().join("\n")).toMatch(/leafy_oauth=;/);
  });

  it("rejects a missing cookie (replay or expired)", async () => {
    const flow = createGoogleFlow({ env, fetch: createMockFetch({}) });
    const res = await flow.callback(get("/api/auth/google/callback?code=abc&state=whatever"));
    expect(new URL(res.headers.get("location") ?? "").searchParams.get("error")).toBe(
      "invalid_state",
    );
  });

  it("never trusts a next supplied on the callback and sanitizes the stored one", async () => {
    const fetchMock = createMockFetch({ "POST /auth/google": () => ok(mockSession()) });
    const flow = createGoogleFlow({ env, fetch: fetchMock });
    const { state, cookie } = await startAndGetState(flow, "//evil.test");
    const res = await flow.callback(
      get(`/api/auth/google/callback?code=abc&state=${state}&next=//evil.test`, cookie),
    );
    expect(res.headers.get("location")).toBe(`${ORIGIN}/dashboard`);
  });

  it("returns a calm cancelled notice when the user denies access", async () => {
    const flow = createGoogleFlow({ env, fetch: createMockFetch({}) });
    const { state, cookie } = await startAndGetState(flow);
    const res = await flow.callback(
      get(`/api/auth/google/callback?error=access_denied&state=${state}`, cookie),
    );
    expect(new URL(res.headers.get("location") ?? "").searchParams.get("error")).toBe(
      "google_cancelled",
    );
  });

  it("maps API failures to a login error code and sets no session", async () => {
    const fetchMock = createMockFetch({
      "POST /auth/google": () => fail(400, "google_email_unverified"),
    });
    const flow = createGoogleFlow({ env, fetch: fetchMock });
    const { state, cookie } = await startAndGetState(flow);
    const res = await flow.callback(
      get(`/api/auth/google/callback?code=abc&state=${state}`, cookie),
    );
    expect(new URL(res.headers.get("location") ?? "").searchParams.get("error")).toBe(
      "google_email_unverified",
    );
    expect(res.headers.getSetCookie().join("\n")).not.toContain("leafy_at=ey");
  });

  it("treats an unexpected API error as google_auth_failed", async () => {
    const fetchMock = createMockFetch({ "POST /auth/google": () => fail(500, "internal_error") });
    const flow = createGoogleFlow({ env, fetch: fetchMock });
    const { state, cookie } = await startAndGetState(flow);
    const res = await flow.callback(
      get(`/api/auth/google/callback?code=abc&state=${state}`, cookie),
    );
    expect(new URL(res.headers.get("location") ?? "").searchParams.get("error")).toBe(
      "google_auth_failed",
    );
  });
});
