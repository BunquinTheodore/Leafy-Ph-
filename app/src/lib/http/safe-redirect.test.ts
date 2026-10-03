import { describe, expect, it } from "vitest";
import { sanitizeNext } from "./safe-redirect";

describe("sanitizeNext", () => {
  it("keeps plain internal paths with query and hash", () => {
    expect(sanitizeNext("/scan")).toBe("/scan");
    expect(sanitizeNext("/handbook/tomato?x=1#treatment")).toBe("/handbook/tomato?x=1#treatment");
  });

  it.each([
    "//evil.com",
    "///evil.com",
    "/\\evil.com",
    "\\\\evil.com",
    "https://evil.com",
    "javascript:alert(1)",
    "evil.com",
    "/%2F/evil.com",
    "/\nHost: evil.com",
    "/ok\r\nSet-Cookie: a=b",
    "",
    "/api/auth/logout",
  ])("rejects %j", (value) => {
    expect(sanitizeNext(value)).toBe("/dashboard");
  });

  it("rejects non strings and very long values", () => {
    expect(sanitizeNext(null)).toBe("/dashboard");
    expect(sanitizeNext(undefined)).toBe("/dashboard");
    expect(sanitizeNext(42 as unknown as string)).toBe("/dashboard");
    expect(sanitizeNext(`/${"a".repeat(600)}`)).toBe("/dashboard");
  });

  it("uses a custom fallback", () => {
    expect(sanitizeNext("//x", "/")).toBe("/");
  });
});
