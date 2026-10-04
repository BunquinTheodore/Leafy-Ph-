import { describe, expect, it } from "vitest";
import { ApiError } from "../api/errors";
import { resolveMe } from "./me";

const user = {
  id: "u1",
  email: "ada@example.com",
  first_name: "Ada",
  last_name: "Lovelace",
  email_verified: true,
  auth_methods: ["password"],
  created_at: "2026-01-01T00:00:00Z",
};

describe("resolveMe", () => {
  it("is a guest without cookies and never calls the API", async () => {
    let called = false;
    const result = await resolveMe(false, async () => {
      called = true;
      return user;
    });
    expect(result).toEqual({ kind: "guest" });
    expect(called).toBe(false);
  });

  it("returns the validated user", async () => {
    const result = await resolveMe(true, async () => user);
    expect(result.kind).toBe("user");
    if (result.kind === "user") {
      expect(result.user.first_name).toBe("Ada");
      expect(result.user.auth_methods).toEqual(["password"]);
    }
  });

  it("reports an ended session on 401", async () => {
    const result = await resolveMe(true, async () => {
      throw new ApiError({ status: 401, code: "refresh_invalid", message: "x" });
    });
    expect(result).toEqual({ kind: "expired" });
  });

  it("keeps other API failures as errors", async () => {
    const error = new ApiError({ status: 503, code: "api_unreachable", message: "down" });
    const result = await resolveMe(true, async () => {
      throw error;
    });
    expect(result).toEqual({ kind: "error", error });
  });

  it("treats an unexpected payload as an error", async () => {
    const result = await resolveMe(true, async () => ({ nope: true }));
    expect(result.kind).toBe("error");
  });

  it("hands control flow errors (redirects) back to the caller", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace" });
    const result = await resolveMe(true, async () => {
      throw redirect;
    });
    expect(result).toEqual({ kind: "control", error: redirect });
  });
});
