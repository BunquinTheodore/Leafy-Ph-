// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createMockFetch, fail, mockSession, ok } from "../../../tests/mocks/api";
import { createApiFetch, type ApiFetchDeps } from "./client";
import { ApiError } from "./errors";
import { parseEnvelope } from "./envelope";

const API = "http://api.test/api/v1";

function makeDeps(overrides: Partial<ApiFetchDeps> = {}) {
  const store = { at: "AT-1" as string | undefined, rt: "RT-1" as string | undefined };
  const redirect = vi.fn((url: string): never => {
    throw new Error(`REDIRECT ${url}`);
  });
  const deps: ApiFetchDeps = {
    apiBaseUrl: API,
    fetch: createMockFetch({}),
    readTokens: async () => ({ access: store.at, refresh: store.rt }),
    writeTokens: vi.fn(async (session) => {
      store.at = session.access_token;
      store.rt = session.refresh_token;
    }),
    clearTokens: vi.fn(async () => {
      store.at = undefined;
      store.rt = undefined;
    }),
    refresh: vi.fn(async () => ({ ok: true as const, session: mockSession() })),
    redirect,
    requestId: () => "req-1",
    ...overrides,
  };
  return { deps, store, redirect };
}

describe("parseEnvelope", () => {
  it("unwraps data on success", async () => {
    await expect(parseEnvelope<{ a: number }>(ok({ a: 1 }))).resolves.toEqual({ a: 1 });
  });

  it("throws ApiError with the contract fields", async () => {
    const response = fail(409, "email_taken", "That email already has an account");
    await expect(parseEnvelope(response)).rejects.toMatchObject({
      status: 409,
      code: "email_taken",
      message: "That email already has an account",
      requestId: "req-test",
    });
  });

  it("maps non JSON failures to internal_error", async () => {
    const response = new Response("<html>bad gateway</html>", { status: 502 });
    const error = await parseEnvelope(response).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("internal_error");
    expect((error as ApiError).status).toBe(502);
  });

  it("keeps Retry-After for rate limits", async () => {
    const response = Response.json(
      {
        success: false,
        data: null,
        error: { code: "rate_limited", message: "Slow down", details: null },
      },
      { status: 429, headers: { "Retry-After": "42" } },
    );
    const error = (await parseEnvelope(response).catch((e: unknown) => e)) as ApiError;
    expect(error.retryAfterSeconds).toBe(42);
  });
});

describe("apiFetch", () => {
  it("attaches the bearer token and request id", async () => {
    const fetchMock = createMockFetch({ "GET /users/me": () => ok({ id: "u" }) });
    const { deps } = makeDeps({ fetch: fetchMock });
    const data = await createApiFetch(deps)<{ id: string }>("/users/me");
    expect(data).toEqual({ id: "u" });
    const call = fetchMock.calls[0];
    expect(call?.url).toBe(`${API}/users/me`);
    expect(call?.headers.get("authorization")).toBe("Bearer AT-1");
    expect(call?.headers.get("x-request-id")).toBe("req-1");
  });

  it("skips auth for public calls", async () => {
    const fetchMock = createMockFetch({ "GET /plants": () => ok([]) });
    const { deps } = makeDeps({ fetch: fetchMock });
    await createApiFetch(deps)("/plants", { auth: false });
    expect(fetchMock.calls[0]?.headers.get("authorization")).toBeNull();
  });

  it("refreshes once on 401 and retries in a mutable context", async () => {
    let attempt = 0;
    const fetchMock = createMockFetch({
      "GET /users/me": ({ headers }) => {
        attempt += 1;
        return headers.get("authorization") === "Bearer AT-1"
          ? fail(401, "token_expired")
          : ok({ retried: attempt });
      },
    });
    const { deps, store } = makeDeps({ fetch: fetchMock });
    const data = await createApiFetch(deps)<{ retried: number }>("/users/me", { mutable: true });
    expect(data.retried).toBe(2);
    expect(deps.refresh).toHaveBeenCalledTimes(1);
    expect(deps.writeTokens).toHaveBeenCalledTimes(1);
    expect(store.rt).toBe("rt-new");
  });

  it("does not loop when the retry is also unauthorized", async () => {
    const fetchMock = createMockFetch({ "GET /users/me": () => fail(401, "token_expired") });
    const { deps } = makeDeps({ fetch: fetchMock });
    await expect(createApiFetch(deps)("/users/me", { mutable: true })).rejects.toMatchObject({
      status: 401,
    });
    expect(fetchMock.calls).toHaveLength(2);
  });

  it("clears cookies and throws when the refresh token is rejected", async () => {
    const fetchMock = createMockFetch({ "GET /users/me": () => fail(401, "token_expired") });
    const { deps } = makeDeps({
      fetch: fetchMock,
      refresh: vi.fn(async () => ({ ok: false as const, status: 401, code: "refresh_invalid" })),
    });
    await expect(createApiFetch(deps)("/users/me", { mutable: true })).rejects.toMatchObject({
      code: "refresh_invalid",
    });
    expect(deps.clearTokens).toHaveBeenCalled();
  });

  it("redirects through /api/auth/refresh in a read only (RSC) context", async () => {
    const fetchMock = createMockFetch({ "GET /users/me": () => fail(401, "token_expired") });
    const { deps, redirect } = makeDeps({ fetch: fetchMock });
    await expect(createApiFetch(deps)("/users/me", { next: "/dashboard?tab=1" })).rejects.toThrow(
      "REDIRECT /api/auth/refresh?next=%2Fdashboard%3Ftab%3D1",
    );
    expect(redirect).toHaveBeenCalledTimes(1);
    expect(deps.writeTokens).not.toHaveBeenCalled();
  });

  it("sends JSON bodies with a content type", async () => {
    const fetchMock = createMockFetch({ "POST /scans/1/retry": () => ok({ ok: true }, 202) });
    const { deps } = makeDeps({ fetch: fetchMock });
    await createApiFetch(deps)("/scans/1/retry", { method: "POST", json: { a: 1 } });
    expect(fetchMock.calls[0]?.headers.get("content-type")).toBe("application/json");
    expect(fetchMock.calls[0]?.body).toBe('{"a":1}');
  });

  it("wraps network failures as api_unreachable", async () => {
    const { deps } = makeDeps({ fetch: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")) });
    await expect(createApiFetch(deps)("/plants", { auth: false })).rejects.toMatchObject({
      code: "api_unreachable",
      status: 503,
    });
  });
});
