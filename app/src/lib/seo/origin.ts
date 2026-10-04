const DEFAULT_ORIGIN = "http://localhost:3000";
const DEFAULT_API = "http://localhost:8000";

/** Public origin of the site (no trailing slash). Read at request time, not baked in at build. */
export function siteOrigin(): string {
  return (process.env.APP_ORIGIN ?? DEFAULT_ORIGIN).replace(/\/+$/, "");
}

/** Server only catalog API base. Falls back to localhost so a build without env still works. */
export function catalogApiBase(): string {
  return `${(process.env.API_INTERNAL_URL ?? DEFAULT_API).replace(/\/+$/, "")}/api/v1`;
}
