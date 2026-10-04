import { isIP } from "node:net";

/**
 * The client address to hand to the API as `X-Forwarded-For`.
 *
 * The incoming header is only believed for the number of proxies we trust (`TRUSTED_PROXY_HOPS`),
 * counted from the right because each trusted proxy appends the peer it saw. With zero trusted
 * proxies the header is attacker controlled, so nothing is forwarded and the API falls back to the
 * address of this server. The result is always one validated IP, never the raw header.
 */
export function forwardedClientIp(headers: Headers, trustedHops: number): string | null {
  if (trustedHops <= 0) return null;
  const chain = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (chain.length < trustedHops) return null;
  const candidate = chain[chain.length - trustedHops] ?? "";
  return isIP(candidate) === 0 ? null : candidate;
}
