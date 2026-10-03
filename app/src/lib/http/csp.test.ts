// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildCsp, createNonce, securityHeaders } from "./csp";

describe("createNonce", () => {
  it("returns unique base64 values", () => {
    const a = createNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/=]{16,}$/);
    expect(createNonce()).not.toBe(a);
  });
});

describe("buildCsp", () => {
  const csp = buildCsp({ nonce: "abc", dev: false, imgOrigins: ["http://localhost:9000"] });

  it("locks framing, base uri and form targets", () => {
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("form-action 'self'");
  });

  it("uses a nonce with strict-dynamic and no unsafe-eval in production", () => {
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("allows eval only in dev", () => {
    expect(buildCsp({ nonce: "abc", dev: true, imgOrigins: [] })).toContain("'unsafe-eval'");
  });

  it("allows catalog images and blob/data for 3D textures", () => {
    expect(csp).toContain("img-src 'self' data: blob: http://localhost:9000");
    expect(csp).toContain("worker-src 'self' blob:");
  });
});

describe("securityHeaders", () => {
  it("includes the baseline hardening headers", () => {
    const headers = securityHeaders({ nonce: "n", dev: false, imgOrigins: [], hsts: true });
    expect(headers["Content-Security-Policy"]).toContain("'nonce-n'");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Strict-Transport-Security"]).toContain("max-age=");
    expect(headers["Permissions-Policy"]).toContain("camera=(self)");
  });

  it("omits HSTS when not secure", () => {
    expect(
      securityHeaders({ nonce: "n", dev: true, imgOrigins: [], hsts: false })[
        "Strict-Transport-Security"
      ],
    ).toBeUndefined();
  });
});
