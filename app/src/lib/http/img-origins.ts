/**
 * Origins allowed in the CSP img-src directive: the public object storage host, which serves the
 * presigned scan photos and the catalog images. Only the origin is kept, and anything that is not
 * a plain http(s) URL is dropped, so a bad value can never widen the policy.
 */
export function imgOriginsFrom(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return [];
    return [url.origin];
  } catch {
    return [];
  }
}
