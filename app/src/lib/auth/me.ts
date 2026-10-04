import { ApiError, isApiError } from "../api/errors";
import { userSchema, type UserOut } from "../api/types";

export type MeResult =
  | { kind: "guest" }
  | { kind: "user"; user: UserOut }
  /** The session ended (401 after a refresh attempt). */
  | { kind: "expired" }
  | { kind: "error"; error: ApiError }
  /** A Next.js control flow error such as redirect(); callers rethrow it or ignore it. */
  | { kind: "control"; error: unknown };

const INVALID_RESPONSE = new ApiError({
  status: 502,
  code: "invalid_response",
  message: "Leafy sent an unexpected reply. Please try again.",
});

/**
 * Turns a GET /users/me call into a result object. Pure so it can be tested: the caller says
 * whether session cookies exist and supplies the fetch.
 */
export async function resolveMe(
  hasSessionCookies: boolean,
  fetchMe: () => Promise<unknown>,
): Promise<MeResult> {
  if (!hasSessionCookies) return { kind: "guest" };
  try {
    const parsed = userSchema.safeParse(await fetchMe());
    return parsed.success
      ? { kind: "user", user: parsed.data }
      : { kind: "error", error: INVALID_RESPONSE };
  } catch (error) {
    if (!isApiError(error)) return { kind: "control", error };
    if (error.status === 401) return { kind: "expired" };
    return { kind: "error", error };
  }
}
