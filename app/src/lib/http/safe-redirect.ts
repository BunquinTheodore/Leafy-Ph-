const MAX_NEXT_LENGTH = 512;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const BLOCKED_PREFIXES = ["/api/"];
const PROBE_ORIGIN = "http://leafy.invalid";

/**
 * Returns a safe in app path for post login redirects, or the fallback.
 * Accepts only paths that start with a single "/" and stay on the same origin after parsing.
 */
export function sanitizeNext(raw: string | null | undefined, fallback = "/dashboard"): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_NEXT_LENGTH) return fallback;
  if (CONTROL_CHARS.test(raw) || raw.includes("\\")) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  if (BLOCKED_PREFIXES.some((prefix) => raw.startsWith(prefix))) return fallback;

  let parsed: URL;
  try {
    parsed = new URL(raw, PROBE_ORIGIN);
  } catch {
    return fallback;
  }
  if (parsed.origin !== PROBE_ORIGIN) return fallback;
  const lowerPath = parsed.pathname.toLowerCase();
  if (parsed.pathname.startsWith("//") || lowerPath.includes("/%2f")) return fallback;
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
