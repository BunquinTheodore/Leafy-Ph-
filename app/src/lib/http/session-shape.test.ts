// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { createMockFetch, fail, mockSession, ok } from "../../../tests/mocks/api";
import { createRefresher } from "../auth/refresh";
import { createGoogleSignIn } from "../auth/google";
import { parseEnv } from "../env";
import { createProxy } from "./proxy";

const ORIGIN = "http://localhost:3000";
const env = parseEnv({
  API_INTERNAL_URL: "http://api.test",
  APP_ORIGIN: ORIGIN,
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

describe("google sign in against GoogleSessionOut", () => {
  it("accepts the extra flags and sets the session cookies", async () => {
    const fetchMock = createMockFetch({
      "POST /auth/google": () =>
        ok({ ...mockSession(), is_new_user: true, linked_existing_account: false }),
    });
    const handler = createGoogleSignIn({ env, fetch: fetchMock });
    const res = await handler.handle(post("/api/auth/google", { idToken: "x".repeat(40) }));
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie().join(";")).toContain("leafy_at=");
    expect((await res.json()).data.is_new_user).toBe(true);
  });
});
