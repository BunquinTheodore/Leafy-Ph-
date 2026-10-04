/**
 * Tiny typed mock of the Leafy REST contract (see the plan, "REST contract").
 * It is a fetch compatible function so tests (and a dev run) never wait for the backend.
 */
import type { ApiErrorBody, AuthSessionOut, UserOut } from "@/lib/api/types";

export type MockFetch = ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) & {
  calls: Array<{ url: string; method: string; headers: Headers; body: string | null }>;
};

export const mockUser: UserOut = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "ada@example.com",
  first_name: "Ada",
  last_name: "Lovelace",
  email_verified: true,
  auth_methods: ["password"],
};

export function jwtWithExp(expSeconds: number): string {
  const enc = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${enc({ alg: "HS256", typ: "JWT" })}.${enc({ sub: mockUser.id, exp: expSeconds })}.sig`;
}

export function mockSession(overrides: Partial<AuthSessionOut> = {}): AuthSessionOut {
  return {
    access_token: jwtWithExp(Math.floor(Date.now() / 1000) + 900),
    refresh_token: "rt-new",
    token_type: "bearer",
    expires_in: 900,
    refresh_expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    user: mockUser,
    ...overrides,
  };
}

export function ok<T>(data: T, status = 200): Response {
  return Response.json({ success: true, data, error: null }, { status });
}

export function fail(
  status: number,
  code: string,
  message = "Something went wrong",
  extra: Partial<ApiErrorBody> = {},
): Response {
  return Response.json(
    {
      success: false,
      data: null,
      error: { code, message, details: null, request_id: "req-test", ...extra },
    },
    { status },
  );
}

type Handler = (request: {
  url: URL;
  method: string;
  headers: Headers;
  body: string | null;
}) => Response | Promise<Response>;

export function createMockFetch(routes: Record<string, Handler | Response>): MockFetch {
  const calls: MockFetch["calls"] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = new Headers(init?.headers);
    let body: string | null = null;
    if (typeof init?.body === "string") body = init.body;
    calls.push({ url: url.toString(), method, headers, body });
    const key = `${method} ${url.pathname.replace(/^\/api\/v1/, "")}`;
    const route = routes[key];
    if (!route) return fail(404, "not_found", `No mock for ${key}`);
    return route instanceof Response ? route.clone() : route({ url, method, headers, body });
  }) as MockFetch;
  fn.calls = calls;
  return fn;
}
