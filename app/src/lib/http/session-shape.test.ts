// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { createMockFetch, fail, mockSession, ok } from "../../../tests/mocks/api";
import { createRefresher } from "../auth/refresh";
import { createGoogleFlow } from "../auth/google";
import { parseEnv } from "../env";
import { createProxy } from "./proxy";

const ORIGIN = "http://localhost:3000";
const env = parseEnv({
  API_INTERNAL_URL: "http://api.test",
  APP_ORIGIN: ORIGIN,
  GOOGLE_CLIENT_ID: "client-123",
});

const post = (path: string, body: unknown) =>
  new NextRequest(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

function proxyFor(routes: Parameters<typeof createMockFetch>[0]) {
  const fetchMock = createMockFetch(routes);
  return createProxy({
    env,
    fetch: fetchMock,
    refresh: createRefresher({ fetch: fetchMock, apiBaseUrl: env.apiBaseUrl }),
    now: () => Date.now(),
  });
}

/** AuthSessionOut exactly as api/openapi.json publishes it. */
const apiSession = () => ({
  ...mockSession({ refresh_token: "rt-api" }),
  email_verified_at: undefined,
});

describe("register and login against the published AuthSessionOut", () => {
  for (const [path, status] of [
    ["/auth/register", 201],
    ["/auth/login", 200],
  ] as const) {
    it(`${path} stores both cookies and hands the browser only the user`, async () => {
      const proxy = proxyFor({ [`POST ${path}`]: () => ok(apiSession(), status) });
      const res = await proxy.session(post(`/api${path}`, { email: "a@b.co", password: "x" }), {
        apiPath: path,
      });
      expect(res.status).toBe(status);
      const body = await res.json();
      expect(body.data.user.email).toBe("ada@example.com");
      expect(JSON.stringify(body)).not.toMatch(/access_token|refresh_token/);
      const cookies = res.headers.getSetCookie().join("\n");
      expect(cookies).toContain("leafy_at=");
      expect(cookies).toContain("leafy_rt=rt-api");
      expect(cookies).toContain("HttpOnly");
    });
  }

  it("rejects a reply that lacks refresh_expires_at instead of setting half a session", async () => {
    const broken: Partial<ReturnType<typeof apiSession>> = apiSession();
    delete broken.refresh_expires_at;
    const proxy = proxyFor({ "POST /auth/login": () => ok(broken) });
    const res = await proxy.session(post("/api/auth/login", { email: "a@b.co", password: "x" }), {
      apiPath: "/auth/login",
    });
    expect(res.status).toBe(502);
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });

  it("passes email_taken through with its status for the register form", async () => {
    const proxy = proxyFor({ "POST /auth/register": () => fail(409, "email_taken", "taken") });
    const res = await proxy.session(post("/api/auth/register", { email: "a@b.co" }), {
      apiPath: "/auth/register",
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("email_taken");
  });
});

describe("google callback against GoogleSessionOut", () => {
  it("accepts the extra flags and sets the session cookies", async () => {
    const fetchMock = createMockFetch({
      "POST /auth/google": () =>
        ok({ ...mockSession(), is_new_user: true, linked_existing_account: false }),
    });
    const flow = createGoogleFlow({ env, fetch: fetchMock });
    const start = await flow.start(new NextRequest(`${ORIGIN}/api/auth/google?next=/scan`));
    const cookie = (
      start.headers.getSetCookie().find((c) => c.startsWith("leafy_oauth=")) ?? ""
    ).split(";")[0];
    const state = new URL(start.headers.get("location") ?? "").searchParams.get("state");
    const res = await flow.callback(
      new NextRequest(`${ORIGIN}/api/auth/google/callback?code=abc&state=${state}`, {
        headers: { cookie: cookie ?? "" },
      }),
    );
    expect(res.headers.get("location")).toBe(`${ORIGIN}/scan`);
    expect(res.headers.getSetCookie().join("\n")).toContain("leafy_at=");
  });
});
