// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { createMockFetch, fail, jwtWithExp, mockSession, ok } from "../../../tests/mocks/api";
import { parseEnv } from "../env";
import { createRefresher } from "../auth/refresh";
import { createProxy } from "./proxy";

const ORIGIN = "http://localhost:3000";
const env = parseEnv({ API_INTERNAL_URL: "http://api.test", APP_ORIGIN: ORIGIN });
const API = env.apiBaseUrl;

function request(
  path: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: BodyInit | null;
    cookie?: string;
  } = {},
) {
  const headers = new Headers({ origin: ORIGIN, ...init.headers });
  if (init.cookie) headers.set("cookie", init.cookie);
  return new NextRequest(`${ORIGIN}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body ?? null,
    duplex: "half",
  } as ConstructorParameters<typeof NextRequest>[1]);
}

function setup(routes: Parameters<typeof createMockFetch>[0]) {
  const fetchMock = createMockFetch(routes);
  const proxy = createProxy({
    env,
    fetch: fetchMock,
    refresh: createRefresher({ fetch: fetchMock, apiBaseUrl: API }),
    now: () => Date.now(),
  });
  return { fetchMock, proxy };
}

const freshAt = () => jwtWithExp(Math.floor(Date.now() / 1000) + 600);
const staleAt = () => jwtWithExp(Math.floor(Date.now() / 1000) - 60);

describe("proxy client address", () => {
  const send = async (hops: string | undefined, xff: string) => {
    const hopsEnv = parseEnv({
      API_INTERNAL_URL: "http://api.test",
      APP_ORIGIN: ORIGIN,
      ...(hops ? { TRUSTED_PROXY_HOPS: hops } : {}),
    });
    const fetchMock = createMockFetch({ "POST /auth/login": () => ok(mockSession()) });
    const proxy = createProxy({
      env: hopsEnv,
      fetch: fetchMock,
      refresh: createRefresher({ fetch: fetchMock, apiBaseUrl: hopsEnv.apiBaseUrl }),
      now: () => Date.now(),
    });
    await proxy.session(
      request("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: "a@b.co", password: "pw" }),
        headers: { "content-type": "application/json", "x-forwarded-for": xff },
      }),
      { apiPath: "/auth/login" },
    );
    return fetchMock.calls[0]?.headers.get("x-forwarded-for") ?? null;
  };

  it("sends only the trusted, validated client address", async () => {
    expect(await send("1", "6.6.6.6, 203.0.113.7")).toBe("203.0.113.7");
  });

  it("drops a client supplied header when no proxy is trusted", async () => {
    expect(await send(undefined, "6.6.6.6")).toBeNull();
  });
});

describe("proxy.session (login/register style)", () => {
  it("sets cookies and never returns tokens to the browser", async () => {
    const { proxy } = setup({ "POST /auth/login": () => ok(mockSession()) });
    const res = await proxy.session(
      request("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: "a@b.co", password: "pw" }),
        headers: { "content-type": "application/json" },
      }),
      { apiPath: "/auth/login" },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(JSON.stringify(body)).not.toContain("access_token");
    expect(JSON.stringify(body)).not.toContain("refresh_token");
    expect(body.data.user.email).toBe("ada@example.com");
    const cookies = res.headers.getSetCookie().join("\n");
    expect(cookies).toContain("leafy_at=");
    expect(cookies).toContain("leafy_rt=rt-new");
    expect(cookies.toLowerCase()).toContain("httponly");
    expect(cookies.toLowerCase()).toContain("samesite=lax");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("passes API errors through and sets no cookies", async () => {
    const { proxy } = setup({
      "POST /auth/login": () => fail(401, "invalid_credentials", "Email or password is wrong"),
    });
    const res = await proxy.session(
      request("/api/auth/login", {
        method: "POST",
        body: "{}",
        headers: { "content-type": "application/json" },
      }),
      { apiPath: "/auth/login" },
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("invalid_credentials");
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });

  it("blocks cross origin posts before calling the API", async () => {
    const { proxy, fetchMock } = setup({ "POST /auth/login": () => ok(mockSession()) });
    const res = await proxy.session(
      request("/api/auth/login", {
        method: "POST",
        body: "{}",
        headers: { origin: "http://evil.test", "content-type": "application/json" },
      }),
      { apiPath: "/auth/login" },
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("csrf_failed");
    expect(fetchMock.calls).toHaveLength(0);
  });

  it("rejects oversized JSON bodies with payload_too_large", async () => {
    const { proxy, fetchMock } = setup({});
    const big = JSON.stringify({ pad: "x".repeat(70_000) });
    const res = await proxy.session(
      request("/api/auth/login", {
        method: "POST",
        body: big,
        headers: { "content-type": "application/json" },
      }),
      { apiPath: "/auth/login" },
    );
    expect(res.status).toBe(413);
    expect((await res.json()).error.code).toBe("payload_too_large");
    expect(fetchMock.calls).toHaveLength(0);
  });

  it("rejects non JSON bodies", async () => {
    const { proxy } = setup({});
    const res = await proxy.session(
      request("/api/auth/login", {
        method: "POST",
        body: "a=b",
        headers: { "content-type": "text/plain" },
      }),
      { apiPath: "/auth/login" },
    );
    expect(res.status).toBe(415);
  });
});

describe("proxy.json (authenticated)", () => {
  it("returns 401 not_authenticated without calling the API when there are no cookies", async () => {
    const { proxy, fetchMock } = setup({});
    const res = await proxy.json(request("/api/me"), { apiPath: "/users/me", auth: "required" });
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("not_authenticated");
    expect(fetchMock.calls).toHaveLength(0);
  });

  it("forwards the bearer token and the envelope", async () => {
    const at = freshAt();
    const { proxy, fetchMock } = setup({ "GET /users/me": () => ok({ id: "u" }) });
    const res = await proxy.json(request("/api/me", { cookie: `leafy_at=${at}; leafy_rt=rt` }), {
      apiPath: "/users/me",
      auth: "required",
    });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ id: "u" });
    expect(fetchMock.calls[0]?.headers.get("authorization")).toBe(`Bearer ${at}`);
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });

  it("refreshes first when the access token is expired and sets the new cookies", async () => {
    const newAt = freshAt();
    const { proxy, fetchMock } = setup({
      "POST /auth/refresh": () => ok(mockSession({ access_token: newAt })),
      "GET /users/me": ({ headers }) =>
        headers.get("authorization") === `Bearer ${newAt}`
          ? ok({ id: "u" })
          : fail(401, "token_expired"),
    });
    const res = await proxy.json(
      request("/api/me", { cookie: `leafy_at=${staleAt()}; leafy_rt=rt-old` }),
      { apiPath: "/users/me", auth: "required" },
    );
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie().join("\n")).toContain("leafy_rt=rt-new");
    expect(fetchMock.calls.filter((c) => c.url.endsWith("/auth/refresh"))).toHaveLength(1);
  });

  it("retries once after a 401 from the API", async () => {
    const newAt = freshAt();
    let hits = 0;
    const { proxy } = setup({
      "POST /auth/refresh": () => ok(mockSession({ access_token: newAt })),
      "GET /users/me": ({ headers }) => {
        hits += 1;
        return headers.get("authorization") === `Bearer ${newAt}`
          ? ok({ id: "u" })
          : fail(401, "token_expired");
      },
    });
    const otherAt = jwtWithExp(Math.floor(Date.now() / 1000) + 500);
    const res = await proxy.json(
      request("/api/me", { cookie: `leafy_at=${otherAt}; leafy_rt=rt-old` }),
      { apiPath: "/users/me", auth: "required" },
    );
    expect(res.status).toBe(200);
    expect(hits).toBe(2);
  });

  it("clears cookies and returns 401 when refresh is rejected", async () => {
    const { proxy } = setup({ "POST /auth/refresh": () => fail(401, "refresh_invalid") });
    const res = await proxy.json(
      request("/api/me", { cookie: `leafy_at=${staleAt()}; leafy_rt=bad` }),
      { apiPath: "/users/me", auth: "required" },
    );
    expect(res.status).toBe(401);
    const cookies = res.headers.getSetCookie().join("\n");
    expect(cookies).toContain("leafy_at=;");
    expect(cookies).toContain("leafy_rt=;");
  });

  it("clears cookies after a successful account delete", async () => {
    const { proxy } = setup({ "DELETE /users/me": () => ok({ deleted: true }) });
    const res = await proxy.json(
      request("/api/me", {
        method: "DELETE",
        body: JSON.stringify({ password: "pw" }),
        headers: { "content-type": "application/json" },
        cookie: `leafy_at=${freshAt()}; leafy_rt=rt`,
      }),
      { apiPath: "/users/me", auth: "required", clearCookiesOnSuccess: true },
    );
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie().join("\n")).toContain("leafy_rt=;");
  });

  it("requires same origin on mutating methods but not on GET", async () => {
    const { proxy } = setup({ "GET /scans": () => ok([]) });
    const get = await proxy.json(
      request("/api/scans", {
        headers: { origin: "http://evil.test" },
        cookie: `leafy_at=${freshAt()}`,
      }),
      { apiPath: "/scans", auth: "required" },
    );
    expect(get.status).toBe(200);
    const del = await proxy.json(
      request("/api/scans/1", {
        method: "DELETE",
        headers: { origin: "http://evil.test" },
        cookie: `leafy_at=${freshAt()}`,
      }),
      { apiPath: "/scans/1", auth: "required" },
    );
    expect(del.status).toBe(403);
  });

  it("forwards the query string", async () => {
    const { proxy, fetchMock } = setup({ "GET /scans": () => ok([]) });
    await proxy.json(
      request("/api/scans?limit=5&verdict=healthy", { cookie: `leafy_at=${freshAt()}` }),
      { apiPath: "/scans", auth: "required" },
    );
    expect(new URL(fetchMock.calls[0]?.url ?? "").search).toBe("?limit=5&verdict=healthy");
  });

  it("maps an unreachable API to a 503 envelope", async () => {
    const down = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const proxy = createProxy({ env, fetch: down, refresh: vi.fn(), now: () => Date.now() });
    const res = await proxy.json(request("/api/me", { cookie: `leafy_at=${freshAt()}` }), {
      apiPath: "/users/me",
      auth: "required",
    });
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("api_unreachable");
  });
});

describe("proxy.upload", () => {
  const boundary = "----leafy";
  const multipart = (bytes: number) =>
    `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="a.jpg"\r\nContent-Type: image/jpeg\r\n\r\n${"x".repeat(bytes)}\r\n--${boundary}--\r\n`;
  const headers = (length: number) => ({
    "content-type": `multipart/form-data; boundary=${boundary}`,
    "content-length": String(length),
  });

  it("streams the body to the API with the bearer token and returns 202", async () => {
    let seen: { length: string | null; type: string | null; auth: string | null } | null = null;
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const h = new Headers(init?.headers);
      seen = {
        length: h.get("content-length"),
        type: h.get("content-type"),
        auth: h.get("authorization"),
      };
      expect((init as RequestInit & { duplex?: string }).duplex).toBe("half");
      expect(init?.body).toBeInstanceOf(ReadableStream);
      return ok({ id: "s1", status: "processing", stage: "validating" }, 202);
    });
    const proxy = createProxy({ env, fetch: fetchMock, refresh: vi.fn(), now: () => Date.now() });
    const body = multipart(100);
    const at = freshAt();
    const res = await proxy.upload(
      request("/api/scans", {
        method: "POST",
        body,
        headers: headers(body.length),
        cookie: `leafy_at=${at}; leafy_rt=rt`,
      }),
      { apiPath: "/scans" },
    );
    expect(res.status).toBe(202);
    expect(seen).toEqual({
      length: String(body.length),
      type: `multipart/form-data; boundary=${boundary}`,
      auth: `Bearer ${at}`,
    });
  });

  it("rejects a declared length above the cap before reading the body", async () => {
    const fetchMock = vi.fn();
    const proxy = createProxy({ env, fetch: fetchMock, refresh: vi.fn(), now: () => Date.now() });
    const res = await proxy.upload(
      request("/api/scans", {
        method: "POST",
        body: "x",
        headers: headers(env.maxUploadBytes + 1024 * 1024),
        cookie: `leafy_at=${freshAt()}`,
      }),
      { apiPath: "/scans" },
    );
    expect(res.status).toBe(413);
    expect((await res.json()).error.code).toBe("payload_too_large");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires a length and a multipart content type", async () => {
    const proxy = createProxy({ env, fetch: vi.fn(), refresh: vi.fn(), now: () => Date.now() });
    const noLength = await proxy.upload(
      request("/api/scans", {
        method: "POST",
        body: "x",
        headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
        cookie: `leafy_at=${freshAt()}`,
      }),
      { apiPath: "/scans" },
    );
    expect(noLength.status).toBe(411);
    const wrongType = await proxy.upload(
      request("/api/scans", {
        method: "POST",
        body: "x",
        headers: { "content-type": "application/json", "content-length": "1" },
        cookie: `leafy_at=${freshAt()}`,
      }),
      { apiPath: "/scans" },
    );
    expect(wrongType.status).toBe(415);
  });

  it("refreshes before streaming when the token is expired", async () => {
    const newAt = freshAt();
    const apiFetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).endsWith("/auth/refresh")) return ok(mockSession({ access_token: newAt }));
      expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${newAt}`);
      return ok({ id: "s1", status: "processing", stage: "validating" }, 202);
    });
    const proxy = createProxy({
      env,
      fetch: apiFetch,
      refresh: createRefresher({ fetch: apiFetch, apiBaseUrl: API }),
      now: () => Date.now(),
    });
    const body = multipart(10);
    const res = await proxy.upload(
      request("/api/scans", {
        method: "POST",
        body,
        headers: headers(body.length),
        cookie: `leafy_at=${staleAt()}; leafy_rt=rt-old`,
      }),
      { apiPath: "/scans" },
    );
    expect(res.status).toBe(202);
    expect(res.headers.getSetCookie().join("\n")).toContain("leafy_rt=rt-new");
  });

  it("blocks cross origin uploads", async () => {
    const proxy = createProxy({ env, fetch: vi.fn(), refresh: vi.fn(), now: () => Date.now() });
    const res = await proxy.upload(
      request("/api/scans", {
        method: "POST",
        body: "x",
        headers: { ...headers(1), origin: "http://evil.test" },
        cookie: `leafy_at=${freshAt()}`,
      }),
      { apiPath: "/scans" },
    );
    expect(res.status).toBe(403);
  });
});

describe("proxy.logout", () => {
  it("revokes the refresh token and always clears cookies", async () => {
    const { proxy, fetchMock } = setup({ "POST /auth/logout": () => ok({ ok: true }) });
    const res = await proxy.logout(
      request("/api/auth/logout", { method: "POST", cookie: "leafy_at=a; leafy_rt=rt-1" }),
    );
    expect(res.status).toBe(200);
    expect(JSON.parse(fetchMock.calls[0]?.body ?? "{}")).toEqual({ refresh_token: "rt-1" });
    expect(res.headers.getSetCookie().join("\n")).toContain("leafy_rt=;");
  });

  it("clears cookies even when the API is down", async () => {
    const down = vi.fn().mockRejectedValue(new Error("down"));
    const proxy = createProxy({ env, fetch: down, refresh: vi.fn(), now: () => Date.now() });
    const res = await proxy.logout(
      request("/api/auth/logout", { method: "POST", cookie: "leafy_rt=rt-1" }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie().join("\n")).toContain("leafy_rt=;");
  });
});

describe("proxy.refreshRoute", () => {
  it("POST rotates cookies and answers JSON", async () => {
    const { proxy } = setup({ "POST /auth/refresh": () => ok(mockSession()) });
    const res = await proxy.refreshRoute(
      request("/api/auth/refresh", { method: "POST", cookie: "leafy_rt=rt-old" }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie().join("\n")).toContain("leafy_rt=rt-new");
  });

  it("GET redirects to the sanitized next after refreshing", async () => {
    const { proxy } = setup({ "POST /auth/refresh": () => ok(mockSession()) });
    const res = await proxy.refreshRoute(
      request("/api/auth/refresh?next=/scans", { cookie: "leafy_rt=rt-old" }),
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/scans`);
  });

  it("GET ignores an open redirect next", async () => {
    const { proxy } = setup({ "POST /auth/refresh": () => ok(mockSession()) });
    const res = await proxy.refreshRoute(
      request("/api/auth/refresh?next=//evil.test", { cookie: "leafy_rt=rt-old" }),
    );
    expect(res.headers.get("location")).toBe(`${ORIGIN}/dashboard`);
  });

  it("GET sends expired sessions to login and keeps next", async () => {
    const { proxy } = setup({ "POST /auth/refresh": () => fail(401, "refresh_invalid") });
    const res = await proxy.refreshRoute(
      request("/api/auth/refresh?next=/scans", { cookie: "leafy_rt=bad" }),
    );
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("reason")).toBe("session_expired");
    expect(location.searchParams.get("next")).toBe("/scans");
    expect(res.headers.getSetCookie().join("\n")).toContain("leafy_rt=;");
  });
});
