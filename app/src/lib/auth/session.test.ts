// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { jwtWithExp, mockSession } from "../../../tests/mocks/api";
import { classifyRoute } from "./routes";
import { resolveSession } from "./session";

const NOW = 1_800_000_000_000;
const fresh = jwtWithExp(NOW / 1000 + 600);
const nearlyExpired = jwtWithExp(NOW / 1000 + 10);

describe("classifyRoute", () => {
  it.each([
    ["/dashboard", "protected"],
    ["/dashboard/x", "protected"],
    ["/scan", "protected"],
    ["/scans/abc", "protected"],
    ["/account", "protected"],
    ["/login", "guest"],
    ["/register", "guest"],
    ["/forgot-password", "guest"],
    ["/", "public"],
    ["/handbook/tomato", "public"],
    ["/scanner", "public"],
    ["/accounting", "public"],
    ["/brand", "public"],
  ])("%s is %s", (path, expected) => {
    expect(classifyRoute(path)).toBe(expected);
  });
});

describe("resolveSession", () => {
  it("is anonymous with no cookies", async () => {
    const refresh = vi.fn();
    const result = await resolveSession(
      { access: undefined, refresh: undefined },
      { refresh, now: () => NOW },
    );
    expect(result).toEqual({ authenticated: false, rotated: null, clear: false });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("keeps a fresh access token without refreshing", async () => {
    const refresh = vi.fn();
    const result = await resolveSession(
      { access: fresh, refresh: "rt" },
      { refresh, now: () => NOW },
    );
    expect(result.authenticated).toBe(true);
    expect(result.rotated).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes proactively when the token is within 30s of expiry", async () => {
    const session = mockSession();
    const refresh = vi.fn().mockResolvedValue({ ok: true, session });
    const result = await resolveSession(
      { access: nearlyExpired, refresh: "rt" },
      { refresh, now: () => NOW },
    );
    expect(refresh).toHaveBeenCalledWith("rt");
    expect(result).toMatchObject({ authenticated: true, rotated: session, clear: false });
  });

  it("refreshes when only the refresh cookie remains", async () => {
    const session = mockSession();
    const refresh = vi.fn().mockResolvedValue({ ok: true, session });
    const result = await resolveSession(
      { access: undefined, refresh: "rt" },
      { refresh, now: () => NOW },
    );
    expect(result.authenticated).toBe(true);
  });

  it("clears cookies when the refresh token is rejected", async () => {
    const refresh = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 401, code: "refresh_reuse_detected" });
    const result = await resolveSession(
      { access: nearlyExpired, refresh: "rt" },
      { refresh, now: () => NOW },
    );
    expect(result).toEqual({ authenticated: false, rotated: null, clear: true });
  });

  it("keeps the session on transient failures while the old token still works", async () => {
    const refresh = vi.fn().mockResolvedValue({ ok: false, status: 503, code: "api_unreachable" });
    const result = await resolveSession(
      { access: nearlyExpired, refresh: "rt" },
      { refresh, now: () => NOW },
    );
    expect(result).toEqual({ authenticated: true, rotated: null, clear: false });
  });

  it("is anonymous without clearing on transient failure when nothing valid remains", async () => {
    const refresh = vi.fn().mockResolvedValue({ ok: false, status: 503, code: "api_unreachable" });
    const result = await resolveSession(
      { access: undefined, refresh: "rt" },
      { refresh, now: () => NOW },
    );
    expect(result).toEqual({ authenticated: false, rotated: null, clear: false });
  });
});
