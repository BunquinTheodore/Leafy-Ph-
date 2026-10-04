import { postAuth, type AuthResult } from "./client";

export type VerifyOutcome = "verified" | "already" | "expired" | "failed";

type Post = (path: string, body: unknown) => Promise<AuthResult<unknown>>;

export function outcomeFor(result: AuthResult<unknown>): VerifyOutcome {
  if (result.ok) return "verified";
  if (result.code === "token_invalid_or_expired") return "expired";
  if (result.code === "already_verified") return "already";
  return "failed";
}

/**
 * Verification tokens work once, so the POST must never run twice for the same link. React strict
 * mode runs effects twice and a remount would repeat the call: share the first answer per token.
 * A failed attempt (network, server) is forgotten so the Try again button can retry.
 */
export function createVerifier(post: Post = postAuth) {
  const attempts = new Map<string, Promise<VerifyOutcome>>();
  return (token: string): Promise<VerifyOutcome> => {
    const existing = attempts.get(token);
    if (existing) return existing;
    const attempt = post("/api/auth/verify-email", { token }).then((result) => {
      const outcome = outcomeFor(result);
      if (outcome === "failed") attempts.delete(token);
      return outcome;
    });
    attempts.set(token, attempt);
    return attempt;
  };
}

export const verifyEmailToken = createVerifier();
