import { ApiError } from "../api/errors";

function fail(): never {
  throw new ApiError({
    status: 403,
    code: "csrf_failed",
    message: "This request did not come from Leafy. Reload the page and try again.",
  });
}

function originOf(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * Same origin check for state changing handlers. Requires an Origin (or Referer) that equals
 * APP_ORIGIN and refuses explicit cross site fetch metadata. Throws ApiError csrf_failed.
 */
export function assertSameOrigin(request: Request, appOrigin: string): void {
  if (request.headers.get("sec-fetch-site") === "cross-site") fail();
  const origin = request.headers.get("origin");
  const candidate = origin !== null ? originOf(origin) : originOf(request.headers.get("referer"));
  if (candidate === null || candidate !== appOrigin) fail();
}
