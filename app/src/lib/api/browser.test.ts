import { afterEach, describe, expect, it, vi } from "vitest";
import { callApi } from "./browser";

const respond = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

afterEach(() => vi.unstubAllGlobals());

describe("callApi", () => {
  it("returns the unwrapped data and sends JSON with the method", async () => {
    const fetchMock = vi.fn(async () =>
      respond(200, { success: true, data: { ok: 1 }, error: null }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await callApi<{ ok: number }>("/api/me", { method: "PATCH", json: { a: 1 } });
    expect(result).toEqual({ ok: true, data: { ok: 1 } });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/me");
    expect(init.method).toBe("PATCH");
    expect(init.body).toBe('{"a":1}');
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
    expect(init.credentials).toBe("same-origin");
  });

  it("maps an error envelope and the Retry-After header", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        respond(
          429,
          {
            success: false,
            data: null,
            error: { code: "rate_limited", message: "Slow down", details: null },
          },
          { "retry-after": "42" },
        ),
      ),
    );
    const result = await callApi("/api/auth/resend-verification", { method: "POST" });
    expect(result).toEqual({
      ok: false,
      error: {
        status: 429,
        code: "rate_limited",
        message: "Slow down",
        details: null,
        retryAfterSeconds: 42,
      },
    });
  });

  it("reports a network failure as api_unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("offline"))),
    );
    const result = await callApi("/api/me");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("api_unreachable");
      expect(result.error.message).toMatch(/connection/i);
    }
  });

  it("treats a non JSON reply as a generic failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>", { status: 502 })),
    );
    const result = await callApi("/api/me");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("internal_error");
  });
});
