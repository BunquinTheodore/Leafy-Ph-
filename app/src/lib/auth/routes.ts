export type RouteKind = "protected" | "guest" | "public";

const PROTECTED_PREFIXES = ["/dashboard", "/scan", "/scans", "/account"] as const;
const GUEST_PREFIXES = ["/login", "/register"] as const;

const matches = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

/** Decides how middleware treats a path. Matches on whole segments (/scanner is public). */
export function classifyRoute(pathname: string): RouteKind {
  if (PROTECTED_PREFIXES.some((prefix) => matches(pathname, prefix))) return "protected";
  if (GUEST_PREFIXES.some((prefix) => matches(pathname, prefix))) return "guest";
  return "public";
}
