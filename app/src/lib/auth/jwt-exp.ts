/** Reads the `exp` claim (seconds) of a JWT without verifying it. Only for scheduling refreshes. */
export function readJwtExp(token: string | undefined): number | null {
  if (!token) return null;
  const parts = token.split(".");
  const payloadPart = parts[1];
  if (parts.length !== 3 || !payloadPart) return null;
  try {
    const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const json = new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)));
    const payload: unknown = JSON.parse(json);
    if (typeof payload === "object" && payload !== null && "exp" in payload) {
      const exp = (payload as { exp: unknown }).exp;
      return typeof exp === "number" && Number.isFinite(exp) ? exp : null;
    }
    return null;
  } catch {
    return null;
  }
}

export const DEFAULT_REFRESH_SKEW_SECONDS = 30;

/** True when the token is missing, unreadable, or expires within `skewSeconds`. */
export function isExpiringSoon(
  token: string | undefined,
  nowMs: number,
  skewSeconds: number = DEFAULT_REFRESH_SKEW_SECONDS,
): boolean {
  const exp = readJwtExp(token);
  if (exp === null) return true;
  return exp * 1000 - nowMs <= skewSeconds * 1000;
}
