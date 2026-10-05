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

describe("buildCsp with Firebase sign in", () => {
  const host = "leafy-8ecd6.firebaseapp.com";
  const csp = buildCsp({ nonce: "abc", dev: false, imgOrigins: [], firebaseAuthDomain: host });
  const directive = (name: string) =>
    csp.split("; ").find((part) => part.startsWith(`${name} `)) ?? "";

  it("allows only the Firebase token endpoints in connect-src", () => {
    expect(directive("connect-src")).toBe(
      "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com",
    );
  });

  it("allows only the auth domain and Google accounts as frames", () => {
    expect(directive("frame-src")).toBe(`frame-src https://${host} https://accounts.google.com`);
  });

  it("adds the gapi host to script-src and keeps the nonce and strict-dynamic", () => {
    expect(directive("script-src")).toBe(
      "script-src 'self' 'nonce-abc' 'strict-dynamic' https://apis.google.com",
    );
  });

  it("adds nothing without a configured domain", () => {
    const plain = buildCsp({ nonce: "abc", dev: false, imgOrigins: [] });
    expect(plain).not.toContain("googleapis.com");
    expect(plain).not.toContain("frame-src");
    expect(plain).not.toContain("apis.google.com");
    expect(plain).toContain("default-src 'self'");
  });
});

describe("securityHeaders", () => {
  it("lets the sign in popup reach its opener without dropping isolation", () => {
    const headers = securityHeaders({ nonce: "n", dev: false, imgOrigins: [], hsts: false });
    expect(headers["Cross-Origin-Opener-Policy"]).toBe("same-origin-allow-popups");
  });

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
