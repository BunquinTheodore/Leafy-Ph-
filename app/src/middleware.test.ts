// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { jwtWithExp, mockSession } from "../tests/mocks/api";

const refreshMock = vi.fn();

vi.mock("@/lib/auth/refresh", () => ({ refreshSession: (token: string) => refreshMock(token) }));

const ORIGIN = "http://localhost:3000";

beforeEach(() => {
  refreshMock.mockReset();
  process.env.API_INTERNAL_URL = "http://api.test";
  process.env.APP_ORIGIN = ORIGIN;
  process.env.COOKIE_SECURE = "false";
  process.env.COOKIE_PREFIX = "";
});

async function run(path: string, cookie?: string) {
  const { middleware } = await import("./middleware");
  const headers = new Headers(cookie ? { cookie } : {});
  return middleware(new NextRequest(`${ORIGIN}${path}`, { headers }));
}

const freshAt = () => jwtWithExp(Math.floor(Date.now() / 1000) + 600);

describe("middleware", () => {
  it("redirects guests from protected routes to login with a sanitized next", async () => {
    const res = await run("/scans/abc?tab=1");
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/scans/abc?tab=1");
  });

  it("redirects signed in users away from guest routes", async () => {
    const res = await run("/login", `leafy_at=${freshAt()}; leafy_rt=rt`);
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location") ?? "").pathname).toBe("/dashboard");
  });

  it("keeps rotated cookies when redirecting a refreshed visitor off a guest route", async () => {
    refreshMock.mockResolvedValue({
      ok: true,
      session: mockSession({ refresh_token: "rt-rotated" }),
    });
    const res = await run("/login", "leafy_rt=rt-old");
    expect(refreshMock).toHaveBeenCalledWith("rt-old");
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location") ?? "").pathname).toBe("/dashboard");
    const setCookies = res.headers.getSetCookie().join("\n");
    expect(setCookies).toContain("leafy_rt=rt-rotated");
    expect(setCookies).toContain("leafy_at=");
  });

  it("lets public routes through with a nonce CSP and hardening headers", async () => {
    const res = await run("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toMatch(
      /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/,
    );
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
  });

  it("refreshes proactively and sets the rotated cookies", async () => {
    refreshMock.mockResolvedValue({
      ok: true,
      session: mockSession({ refresh_token: "rt-rotated" }),
    });
    const res = await run("/dashboard", "leafy_rt=rt-old");
    expect(refreshMock).toHaveBeenCalledWith("rt-old");
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie().join("\n")).toContain("leafy_rt=rt-rotated");
  });

  it("clears cookies and sends the visitor to login when refresh is rejected", async () => {
    refreshMock.mockResolvedValue({ ok: false, status: 401, code: "refresh_invalid" });
    const res = await run("/account", "leafy_rt=bad");
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.searchParams.get("reason")).toBe("session_expired");
    expect(location.searchParams.get("next")).toBe("/account");
    expect(res.headers.getSetCookie().join("\n")).toContain("leafy_rt=;");
  });
});
