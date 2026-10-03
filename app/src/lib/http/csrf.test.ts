// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ApiError } from "../api/errors";
import { assertSameOrigin } from "./csrf";

const ORIGIN = "http://localhost:3000";
const req = (headers: Record<string, string>) =>
  new Request(`${ORIGIN}/api/auth/login`, { method: "POST", headers });

describe("assertSameOrigin", () => {
  it("accepts a matching Origin header", () => {
    expect(() => assertSameOrigin(req({ origin: ORIGIN }), ORIGIN)).not.toThrow();
  });

  it("falls back to the Referer origin", () => {
    expect(() =>
      assertSameOrigin(req({ referer: `${ORIGIN}/login?next=/scan` }), ORIGIN),
    ).not.toThrow();
  });

  it("rejects a foreign Origin with csrf_failed", () => {
    try {
      assertSameOrigin(req({ origin: "http://evil.test" }), ORIGIN);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).code).toBe("csrf_failed");
      expect((error as ApiError).status).toBe(403);
    }
  });

  it("rejects requests with neither Origin nor Referer", () => {
    expect(() => assertSameOrigin(req({}), ORIGIN)).toThrow(ApiError);
  });

  it("rejects an unparsable Origin such as null", () => {
    expect(() => assertSameOrigin(req({ origin: "null" }), ORIGIN)).toThrow(ApiError);
  });

  it("rejects cross site fetch metadata even with a matching Origin", () => {
    expect(() =>
      assertSameOrigin(req({ origin: ORIGIN, "sec-fetch-site": "cross-site" }), ORIGIN),
    ).toThrow(ApiError);
  });
});
