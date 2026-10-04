// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createMockFetch, fail, mockSession, ok } from "../../../tests/mocks/api";
import { createRefresher, hashToken } from "./refresh";

const API = "http://api.test/api/v1";

describe("hashToken", () => {
  it("is a stable hex sha256", async () => {
    const a = await hashToken("token");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashToken("token")).toBe(a);
    expect(await hashToken("other")).not.toBe(a);
  });
});

describe("createRefresher", () => {
  it("returns the new tokens on success", async () => {
    const fetchMock = createMockFetch({ "POST /auth/refresh": () => ok(mockSession()) });
    const refresh = createRefresher({ fetch: fetchMock, apiBaseUrl: API });
    const result = await refresh("rt-old");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.session.refresh_token).toBe("rt-new");
    expect(JSON.parse(fetchMock.calls[0]?.body ?? "{}")).toEqual({ refresh_token: "rt-old" });
  });

  it("keeps the held refresh token when the API answers with a null one (grace window)", async () => {
    const fetchMock = createMockFetch({
      "POST /auth/refresh": () =>
        ok({
          access_token: "at-grace",
          refresh_token: null,
          token_type: "bearer",
          expires_in: 900,
          refresh_expires_at: null,
        }),
    });
    const refresh = createRefresher({ fetch: fetchMock, apiBaseUrl: API });
    const result = await refresh("rt-held");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session.access_token).toBe("at-grace");
      expect(result.session.refresh_token).toBe("rt-held");
    }
  });

  it("collapses concurrent calls with the same token into one request", async () => {
    const fetchMock = createMockFetch({ "POST /auth/refresh": () => ok(mockSession()) });
    const refresh = createRefresher({ fetch: fetchMock, apiBaseUrl: API });
    const [a, b, c] = await Promise.all([refresh("rt-old"), refresh("rt-old"), refresh("rt-old")]);
    expect(fetchMock.calls).toHaveLength(1);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  it("keeps the settled result for 15 seconds then refreshes again", async () => {
    let clock = 1_000;
    const fetchMock = createMockFetch({ "POST /auth/refresh": () => ok(mockSession()) });
    const refresh = createRefresher({ fetch: fetchMock, apiBaseUrl: API, now: () => clock });
    await refresh("rt-old");
    clock += 14_000;
    await refresh("rt-old");
    expect(fetchMock.calls).toHaveLength(1);
    clock += 2_000;
    await refresh("rt-old");
    expect(fetchMock.calls).toHaveLength(2);
  });

  it("does not share results across different tokens", async () => {
    const fetchMock = createMockFetch({ "POST /auth/refresh": () => ok(mockSession()) });
    const refresh = createRefresher({ fetch: fetchMock, apiBaseUrl: API });
    await Promise.all([refresh("rt-a"), refresh("rt-b")]);
    expect(fetchMock.calls).toHaveLength(2);
  });

  it("reports a rejected refresh token without throwing", async () => {
    const fetchMock = createMockFetch({ "POST /auth/refresh": () => fail(401, "refresh_invalid") });
    const refresh = createRefresher({ fetch: fetchMock, apiBaseUrl: API });
    const result = await refresh("rt-bad");
    expect(result).toEqual({ ok: false, status: 401, code: "refresh_invalid" });
  });

  it("does not cache network failures", async () => {
    const failing = vi.fn().mockRejectedValue(new Error("down"));
    const refresh = createRefresher({ fetch: failing, apiBaseUrl: API });
    const first = await refresh("rt-x");
    expect(first).toMatchObject({ ok: false, code: "api_unreachable" });
    await refresh("rt-x");
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it("treats a malformed success payload as a failure", async () => {
    const fetchMock = createMockFetch({ "POST /auth/refresh": () => ok({ nope: true }) });
    const refresh = createRefresher({ fetch: fetchMock, apiBaseUrl: API });
    expect(await refresh("rt-x")).toMatchObject({ ok: false, code: "invalid_response" });
  });
});
