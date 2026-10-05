import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { errorFromEnvelope, readJson } from "../api/envelope";
import { ApiError } from "../api/errors";
import { googleSessionSchema } from "../api/types";
import { getEnv, type AppEnv } from "../env";
import { forwardedClientIp } from "../http/client-ip";
import { assertSameOrigin } from "../http/csrf";
import { setSessionCookies } from "./cookies";
import { NOTICE_COOKIE, NOTICE_MAX_AGE_SECONDS, noticeAfterGoogle } from "./notice";

const MAX_BODY_BYTES = 16 * 1024;
const NO_STORE = { "cache-control": "no-store" } as const;
/** API codes that mean something to the person; anything else becomes a generic failure. */
const PASS_THROUGH_ERRORS = new Set([
  "google_email_unverified",
  "google_auth_failed",
  "rate_limited",
]);

const bodySchema = z.object({ idToken: z.string().min(20).max(8192) }).strict();

export interface GoogleSignInDeps {
  env: AppEnv;
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

function errorResponse(error: ApiError): NextResponse {
  const headers: Record<string, string> = { ...NO_STORE };
  if (error.retryAfterSeconds !== undefined)
    headers["retry-after"] = String(error.retryAfterSeconds);
  return NextResponse.json(
    {
      success: false,
      data: null,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        request_id: error.requestId,
      },
    },
    { status: error.status, headers },
  );
}

const simpleError = (status: number, code: string, message: string) =>
  errorResponse(new ApiError({ status, code, message }));

type ParsedBody = { ok: true; idToken: string } | { ok: false; response: NextResponse };

async function readBody(request: NextRequest): Promise<ParsedBody> {
  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.startsWith("application/json"))
    return { ok: false, response: simpleError(415, "unsupported_media_type", "Send JSON.") };
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES)
    return {
      ok: false,
      response: simpleError(413, "payload_too_large", "That request is too large."),
    };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success)
    return {
      ok: false,
      response: simpleError(400, "validation_error", "Send the Google ID token as idToken."),
    };
  return { ok: true, idToken: parsed.data.idToken };
}

/**
 * Google sign in, server leg. The browser signs in with Firebase and hands us the ID token; the
 * API verifies it (Google's public certificates, no secret) and returns the normal session, which
 * we turn into httpOnly cookies. The token is never logged or echoed back.
 */
export function createGoogleSignIn({ env, fetch: doFetch }: GoogleSignInDeps) {
  return {
    async handle(request: NextRequest): Promise<NextResponse> {
      try {
        assertSameOrigin(request, env.appOrigin);
      } catch (error) {
        if (error instanceof ApiError) return errorResponse(error);
        throw error;
      }
      const body = await readBody(request);
      if (!body.ok) return body.response;

      const clientIp = forwardedClientIp(request.headers, env.trustedProxyHops);
      let upstream: Response;
      try {
        upstream = await doFetch(`${env.apiBaseUrl}/auth/google`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
            "x-request-id": crypto.randomUUID(),
            ...(clientIp ? { "x-forwarded-for": clientIp } : {}),
          },
          body: JSON.stringify({ id_token: body.idToken }),
          cache: "no-store",
        });
      } catch {
        return simpleError(
          503,
          "api_unreachable",
          "We could not reach Leafy right now. Try again in a moment.",
        );
      }

      const payload = await readJson(upstream);
      if (!upstream.ok) {
        const failure = errorFromEnvelope(upstream.status, payload, upstream);
        if (PASS_THROUGH_ERRORS.has(failure.code)) return errorResponse(failure);
        return simpleError(400, "google_auth_failed", "Google sign in did not work.");
      }
      const session = googleSessionSchema.safeParse((payload as { data?: unknown } | null)?.data);
      if (!session.success)
        return simpleError(
          502,
          "invalid_response",
          "Leafy sent an unexpected reply. Please try again.",
        );

      const { user, is_new_user: isNewUser, linked_existing_account: linked } = session.data;
      const response = NextResponse.json(
        {
          success: true,
          data: { user, is_new_user: isNewUser, linked_existing_account: linked },
          error: null,
        },
        { status: 200, headers: NO_STORE },
      );
      setSessionCookies(response.cookies, session.data, env);
      const notice = noticeAfterGoogle({ isNewUser, linkedExistingAccount: linked });
      if (notice) {
        // Readable by the page (not httpOnly) so it can show the notice once and delete the cookie.
        response.cookies.set(NOTICE_COOKIE, notice, {
          httpOnly: false,
          secure: env.cookieSecure,
          sameSite: "lax",
          path: "/",
          maxAge: NOTICE_MAX_AGE_SECONDS,
        });
      }
      return response;
    },
  };
}

let defaultHandler: ReturnType<typeof createGoogleSignIn> | undefined;

/** Process wide handler wired to the real fetch and environment. */
export function getGoogleSignIn(): ReturnType<typeof createGoogleSignIn> {
  defaultHandler ??= createGoogleSignIn({
    env: getEnv(),
    fetch: (input, init) => fetch(input, init),
  });
  return defaultHandler;
}
