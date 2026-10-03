import { describe, expect, it } from "vitest";
import { isExpiringSoon, readJwtExp } from "./jwt-exp";

function makeJwt(payload: Record<string, unknown>): string {
  const enc = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${enc({ alg: "HS256" })}.${enc(payload)}.sig`;
}

describe("readJwtExp", () => {
  it("returns the exp claim in seconds", () => {
    expect(readJwtExp(makeJwt({ exp: 1234 }))).toBe(1234);
  });

  it("returns null for malformed tokens", () => {
    expect(readJwtExp("")).toBeNull();
    expect(readJwtExp("abc")).toBeNull();
    expect(readJwtExp("a.%%%.c")).toBeNull();
    expect(readJwtExp(makeJwt({ sub: "x" }))).toBeNull();
    expect(readJwtExp(makeJwt({ exp: "soon" }))).toBeNull();
  });
});

describe("isExpiringSoon", () => {
  const now = 1_000_000_000;
  it("treats missing or unreadable tokens as expiring", () => {
    expect(isExpiringSoon(undefined, now)).toBe(true);
    expect(isExpiringSoon("garbage", now)).toBe(true);
  });

  it("flags tokens inside the skew window", () => {
    const soon = makeJwt({ exp: now / 1000 + 20 });
    const later = makeJwt({ exp: now / 1000 + 300 });
    expect(isExpiringSoon(soon, now, 30)).toBe(true);
    expect(isExpiringSoon(later, now, 30)).toBe(false);
  });
});
