import { describe, expect, it, vi } from "vitest";
import { postAuth } from "./client";

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

describe("postAuth", () => {
  it("posts JSON to the Next route and returns the data", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(json(200, { success: true, data: { user: { id: "1" } }, error: null }));
    const result = await postAuth<{ user: { id: string } }>(
      "/api/auth/login",
      { email: "a@b.co", password: "pw" },
      fetcher,
    );
    expect(result).toEqual({ ok: true, data: { user: { id: "1" } } });
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/auth/login");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("same-origin");
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({ email: "a@b.co", password: "pw" });
  });

  it("maps API error codes to our own copy, never the raw server message", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      json(401, {
        success: false,
        data: null,
        error: { code: "invalid_credentials", message: "SERVER TEXT" },
      }),
    );
    const result = await postAuth("/api/auth/login", {}, fetcher);
    expect(result).toMatchObject({ ok: false, status: 401, code: "invalid_credentials" });
    if (!result.ok) {
      expect(result.message).toMatch(/do not match/);
      expect(result.message).not.toContain("SERVER TEXT");
    }
  });

  it("reads Retry-After for rate limits", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        json(
          429,
          { success: false, data: null, error: { code: "rate_limited", message: "x" } },
          { "retry-after": "42" },
        ),
      );
    const result = await postAuth("/api/auth/login", {}, fetcher);
    expect(result).toMatchObject({ ok: false, code: "rate_limited", retryAfter: 42 });
  });

  it("falls back to 60 seconds when a rate limit has no Retry-After", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        json(429, { success: false, data: null, error: { code: "rate_limited", message: "x" } }),
      );
    const result = await postAuth("/api/auth/login", {}, fetcher);
    expect(result).toMatchObject({ ok: false, retryAfter: 60 });
  });

  it("exposes the field names of a validation error and nothing else", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      json(422, {
        success: false,
        data: null,
        error: {
          code: "validation_error",
          message: "x",
          details: [{ field: "password", type: "string_too_short" }, { type: "odd" }],
        },
      }),
    );
    const result = await postAuth("/api/auth/register", {}, fetcher);
    expect(result).toMatchObject({ ok: false, code: "validation_error", fields: ["password"] });
  });

  it("reports a network failure as api_unreachable", async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const result = await postAuth("/api/auth/login", {}, fetcher);
    expect(result).toMatchObject({ ok: false, status: 0, code: "api_unreachable" });
  });

  it("treats a non JSON reply as an internal error", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("<html>", { status: 502 }));
    const result = await postAuth("/api/auth/login", {}, fetcher);
    expect(result).toMatchObject({ ok: false, status: 502, code: "internal_error" });
    if (!result.ok) expect(result.message).toMatch(/Something went wrong/);
  });
});
