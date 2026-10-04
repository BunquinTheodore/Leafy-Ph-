import { describe, expect, it } from "vitest";
import { buildAuthHref, messageForCode, noteFromParams } from "./messages";

describe("messageForCode", () => {
  it("knows the auth codes and falls back calmly", () => {
    expect(messageForCode("invalid_credentials")).toMatch(/do not match/);
    expect(messageForCode("email_taken")).toMatch(/already has an account/);
    expect(messageForCode("something_new")).toMatch(/Something went wrong/);
  });
  it("never uses exclamation marks", () => {
    for (const code of ["invalid_credentials", "rate_limited", "api_unreachable", "x"]) {
      expect(messageForCode(code)).not.toContain("!");
    }
  });
});

describe("noteFromParams", () => {
  it("returns nothing for a plain visit", () => {
    expect(noteFromParams({})).toBeNull();
  });
  it("describes expired and revoked sessions as info", () => {
    expect(noteFromParams({ reason: "session_expired" })).toMatchObject({ tone: "info" });
    expect(noteFromParams({ reason: "session_revoked" })?.text).toMatch(/signed you out/);
  });
  it("describes Google outcomes", () => {
    expect(noteFromParams({ error: "google_cancelled" })?.text).toMatch(/cancelled/);
    expect(noteFromParams({ error: "google_auth_failed" })).toMatchObject({ tone: "error" });
    expect(noteFromParams({ error: "google_email_unverified" })?.text).toMatch(/not verified/);
  });
  it("prefers the error over the reason", () => {
    expect(noteFromParams({ error: "google_cancelled", reason: "session_expired" })?.text).toMatch(
      /cancelled/,
    );
  });
  it("ignores unknown or array values instead of echoing them", () => {
    expect(noteFromParams({ error: "<script>" })).toBeNull();
    expect(noteFromParams({ reason: ["session_expired", "x"] })).toBeNull();
  });
});

describe("buildAuthHref", () => {
  it("carries a safe next across the auth pages", () => {
    expect(buildAuthHref("/register", "/scan")).toBe("/register?next=%2Fscan");
  });
  it("drops an unsafe or default next", () => {
    expect(buildAuthHref("/login", "//evil.example")).toBe("/login");
    expect(buildAuthHref("/login", "https://evil.example")).toBe("/login");
    expect(buildAuthHref("/login", undefined)).toBe("/login");
    expect(buildAuthHref("/login", "/api/me")).toBe("/login");
  });
});
