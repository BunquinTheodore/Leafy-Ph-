// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { createMockFetch, fail, mockSession, ok } from "../../../tests/mocks/api";
import { parseEnv } from "../env";
import { createGoogleSignIn } from "./google";

const ORIGIN = "http://localhost:3000";
const ID_TOKEN = "eyJhbGciOiJSUzI1NiJ9.payload-part-of-a-token.signature-part";
const env = parseEnv({ API_INTERNAL_URL: "http://api.test", APP_ORIGIN: ORIGIN });

interface PostOptions {
  body?: unknown;
  raw?: string;
  headers?: Record<string, string>;
}

function post({ body = { idToken: ID_TOKEN }, raw, headers }: PostOptions = {}) {
  return new NextRequest(`${ORIGIN}/api/auth/google`, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json", ...headers },
    body: raw ?? JSON.stringify(body),
  });
}

const handlerFor = (routes: Parameters<typeof createMockFetch>[0], hops = 0) => {
  const fetchMock = createMockFetch(routes);
  const handler = createGoogleSignIn({
    env: hops
      ? parseEnv({
          API_INTERNAL_URL: "http://api.test",
          APP_ORIGIN: ORIGIN,
          TRUSTED_PROXY_HOPS: String(hops),
        })
      : env,
    fetch: fetchMock,
  });
  return { handler, fetchMock };
};

const flags = (is_new_user: boolean, linked_existing_account: boolean) => ({
  ...mockSession(),
  is_new_user,
  linked_existing_account,
});

describe("google sign in handler", () => {
  it("forwards the ID token to the API, sets the session cookies and returns only the user", async () => {
    const { handler, fetchMock } = handlerFor({
      "POST /auth/google": () => ok(flags(false, false)),
    });
    const res = await handler.handle(post());
    expect(res.status).toBe(200);
    const call = fetchMock.calls[0];
    expect(call?.url).toBe("http://api.test/api/v1/auth/google");
    expect(JSON.parse(call?.body ?? "{}")).toEqual({ id_token: ID_TOKEN });
    const cookies = res.headers.getSetCookie().join("\n");
    expect(cookies).toContain("leafy_at=");
    expect(cookies).toContain("leafy_rt=rt-new");
    expect(cookies.toLowerCase()).toContain("httponly");
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.user.email).toBe("ada@example.com");
    expect(JSON.stringify(json)).not.toContain("rt-new");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it.each([
    ["a first time Google user", flags(true, false), "google_welcome"],
    ["an account linked to Google", flags(false, true), "google_linked"],
  ])("leaves a one time notice cookie for %s", async (_label, session, notice) => {
    const { handler } = handlerFor({ "POST /auth/google": () => ok(session) });
    const res = await handler.handle(post());
    const set = res.headers.getSetCookie().find((c) => c.startsWith("leafy_notice=")) ?? "";
    expect(set).toContain(notice);
    expect(set.toLowerCase()).not.toContain("httponly");
  });

  it("sets no notice cookie for a plain returning sign in", async () => {
    const { handler } = handlerFor({ "POST /auth/google": () => ok(flags(false, false)) });
    const res = await handler.handle(post());
    expect(res.headers.getSetCookie().some((c) => c.startsWith("leafy_notice="))).toBe(false);
  });

  it("uses Secure and the __Host- prefix in production", async () => {
    const prod = parseEnv({
      API_INTERNAL_URL: "http://api.test",
      APP_ORIGIN: ORIGIN,
      COOKIE_PREFIX: "__Host-",
      COOKIE_SECURE: "true",
    });
    const handler = createGoogleSignIn({
      env: prod,
      fetch: createMockFetch({ "POST /auth/google": () => ok(flags(false, false)) }),
    });
    const set = (await handler.handle(post())).headers.getSetCookie().join("\n");
    expect(set).toContain("__Host-leafy_at=");
    expect(set).toContain("Secure");
  });

  it("refuses a cross site request before calling the API", async () => {
    const { handler, fetchMock } = handlerFor({});
    const res = await handler.handle(post({ headers: { origin: "https://evil.example" } }));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("csrf_failed");
    expect(fetchMock.calls).toHaveLength(0);
  });

  it("refuses a request without an Origin or Referer", async () => {
    const { handler } = handlerFor({});
    const request = new NextRequest(`${ORIGIN}/api/auth/google`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: ID_TOKEN }),
    });
    expect((await handler.handle(request)).status).toBe(403);
  });

  it.each([
    ["a missing token", { body: {} }],
    ["a non string token", { body: { idToken: 42 } }],
    ["a too short token", { body: { idToken: "abc" } }],
    ["an unexpected extra field", { body: { idToken: ID_TOKEN, next: "/x" } }],
    ["invalid JSON", { raw: "{not json" }],
  ])("rejects %s with validation_error", async (_label, options) => {
    const { handler, fetchMock } = handlerFor({});
    const res = await handler.handle(post(options));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("validation_error");
    expect(fetchMock.calls).toHaveLength(0);
  });

  it("rejects a non JSON content type and an oversized body", async () => {
    const { handler } = handlerFor({});
    expect((await handler.handle(post({ headers: { "content-type": "text/plain" } }))).status).toBe(
      415,
    );
    const big = await handler.handle(post({ body: { idToken: "x".repeat(20_000) } }));
    expect(big.status).toBe(413);
  });

  it("passes google_email_unverified through", async () => {
    const { handler } = handlerFor({
      "POST /auth/google": () => fail(400, "google_email_unverified"),
    });
    const res = await handler.handle(post());
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("google_email_unverified");
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });

  it("keeps the rate limit status and Retry-After", async () => {
    const { handler } = handlerFor({
      "POST /auth/google": () =>
        new Response(
          JSON.stringify({
            success: false,
            data: null,
            error: { code: "rate_limited", message: "slow down", details: null },
          }),
          { status: 429, headers: { "retry-after": "42", "content-type": "application/json" } },
        ),
    });
    const res = await handler.handle(post());
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("42");
    expect((await res.json()).error.code).toBe("rate_limited");
  });

  it.each([
    ["an unknown API error", () => fail(500, "internal_error", "stack trace here")],
    ["a disabled provider", () => fail(400, "google_auth_failed", "disabled")],
    ["a 502 from the API", () => fail(502, "bad_gateway")],
  ])("turns %s into a generic google_auth_failed without leaking details", async (_l, route) => {
    const { handler } = handlerFor({ "POST /auth/google": route });
    const res = await handler.handle(post());
    const json = await res.json();
    expect(json.error.code).toBe("google_auth_failed");
    expect(JSON.stringify(json)).not.toContain("stack trace");
    expect(JSON.stringify(json)).not.toContain(ID_TOKEN);
  });

  it("answers 503 api_unreachable when the API cannot be reached", async () => {
    const handler = createGoogleSignIn({
      env,
      fetch: async () => {
        throw new TypeError("fetch failed");
      },
    });
    const res = await handler.handle(post());
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("api_unreachable");
  });

  it("answers 502 when the API reply has the wrong shape", async () => {
    const { handler } = handlerFor({ "POST /auth/google": () => ok({ nope: true }) });
    expect((await handler.handle(post())).status).toBe(502);
  });

  it("forwards the trusted client address and drops a spoofed one", async () => {
    const trusted = handlerFor({ "POST /auth/google": () => ok(flags(false, false)) }, 1);
    await trusted.handler.handle(post({ headers: { "x-forwarded-for": "203.0.113.9" } }));
    expect(trusted.fetchMock.calls[0]?.headers.get("x-forwarded-for")).toBe("203.0.113.9");

    const ignored = handlerFor({ "POST /auth/google": () => ok(flags(false, false)) }, 0);
    await ignored.handler.handle(post({ headers: { "x-forwarded-for": "203.0.113.9" } }));
    expect(ignored.fetchMock.calls[0]?.headers.get("x-forwarded-for")).toBeNull();
  });
});
