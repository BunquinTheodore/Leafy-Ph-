import { NextResponse, type NextRequest } from "next/server";
import { clearSessionCookies, cookieNames, setSessionCookies } from "@/lib/auth/cookies";
import { refreshSession } from "@/lib/auth/refresh";
import { classifyRoute } from "@/lib/auth/routes";
import { resolveSession } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { createNonce, securityHeaders, withReferrerPolicyFor } from "@/lib/http/csp";
import { imgOriginsFrom } from "@/lib/http/img-origins";
import { sanitizeNext } from "@/lib/http/safe-redirect";

function withHeaders(response: NextResponse, headers: Record<string, string>): NextResponse {
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
  return response;
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const env = getEnv();
  const nonce = createNonce();
  const names = cookieNames(env.cookiePrefix);
  const headers = withReferrerPolicyFor(
    request.nextUrl.pathname,
    securityHeaders({
      nonce,
      dev: process.env.NODE_ENV !== "production",
      imgOrigins: imgOriginsFrom(process.env.S3_PUBLIC_ENDPOINT),
      hsts: env.cookieSecure,
    }),
  );

  const session = await resolveSession(
    {
      access: request.cookies.get(names.access)?.value,
      refresh: request.cookies.get(names.refresh)?.value,
    },
    { refresh: refreshSession, now: () => Date.now() },
  );

  const { pathname, search } = request.nextUrl;
  const kind = classifyRoute(pathname);

  const redirectTo = (url: URL): NextResponse => {
    const response = withHeaders(NextResponse.redirect(url), headers);
    if (session.rotated) setSessionCookies(response.cookies, session.rotated, env);
    if (session.clear) clearSessionCookies(response.cookies, env);
    return response;
  };

  if (kind === "protected" && !session.authenticated) {
    const url = new URL("/login", env.appOrigin);
    url.searchParams.set("next", sanitizeNext(`${pathname}${search}`, "/dashboard"));
    if (session.clear) url.searchParams.set("reason", "session_expired");
    return redirectTo(url);
  }
  if (kind === "guest" && session.authenticated) {
    return redirectTo(new URL("/dashboard", env.appOrigin));
  }

  // Forward rotated tokens to the rendering request as well as to the browser.
  if (session.rotated) {
    request.cookies.set(names.access, session.rotated.access_token);
    request.cookies.set(names.refresh, session.rotated.refresh_token);
  }
  if (session.clear) {
    request.cookies.delete(names.access);
    request.cookies.delete(names.refresh);
  }
  const forwarded = new Headers(request.headers);
  forwarded.set("x-nonce", nonce);
  forwarded.set("content-security-policy", headers["Content-Security-Policy"] ?? "");

  const response = withHeaders(NextResponse.next({ request: { headers: forwarded } }), headers);
  if (session.rotated) setSessionCookies(response.cookies, session.rotated, env);
  if (session.clear) clearSessionCookies(response.cookies, env);
  return response;
}

export const config = {
  matcher: [
    {
      source:
        "/((?!_next/static|_next/image|api/|favicon.ico|icons/|brand/|og/|cursors/|manifest.webmanifest|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
