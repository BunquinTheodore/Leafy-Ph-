import { describe, expect, it, vi } from "vitest";
import type { AuthResult } from "./client";
import { createVerifier, outcomeFor } from "./verify";

const okResult: AuthResult<unknown> = { ok: true, data: { verified: true } };
const failure = (code: string, status = 400): AuthResult<unknown> => ({
  ok: false,
  status,
  code,
  message: "x",
  fields: [],
});

describe("outcomeFor", () => {
  it("maps API results to a page state", () => {
    expect(outcomeFor(okResult)).toBe("verified");
    expect(outcomeFor(failure("token_invalid_or_expired"))).toBe("expired");
    expect(outcomeFor(failure("already_verified", 409))).toBe("already");
    expect(outcomeFor(failure("api_unreachable", 0))).toBe("failed");
    expect(outcomeFor(failure("internal_error", 500))).toBe("failed");
  });
});

describe("createVerifier", () => {
  it("posts the token once even when asked twice (React strict mode runs effects twice)", async () => {
    const post = vi.fn().mockResolvedValue(okResult);
    const verify = createVerifier(post);
    const [a, b] = await Promise.all([verify("tok"), verify("tok")]);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith("/api/auth/verify-email", { token: "tok" });
    expect(a).toBe("verified");
    expect(b).toBe("verified");
  });

  it("keeps the first answer so a remount does not turn success into expired", async () => {
    const post = vi
      .fn()
      .mockResolvedValueOnce(okResult)
      .mockResolvedValueOnce(failure("token_invalid_or_expired"));
    const verify = createVerifier(post);
    expect(await verify("tok")).toBe("verified");
    expect(await verify("tok")).toBe("verified");
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("lets a failed attempt be retried", async () => {
    const post = vi
      .fn()
      .mockResolvedValueOnce(failure("api_unreachable", 0))
      .mockResolvedValueOnce(okResult);
    const verify = createVerifier(post);
    expect(await verify("tok")).toBe("failed");
    expect(await verify("tok")).toBe("verified");
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("keeps different tokens apart", async () => {
    const post = vi.fn().mockResolvedValue(okResult);
    const verify = createVerifier(post);
    await verify("a");
    await verify("b");
    expect(post).toHaveBeenCalledTimes(2);
  });
});
