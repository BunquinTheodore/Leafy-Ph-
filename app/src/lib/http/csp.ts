export interface CspOptions {
  nonce: string;
  dev: boolean;
  imgOrigins: readonly string[];
  /** Add upgrade-insecure-requests (production behind HTTPS). Defaults to !dev. */
  upgradeInsecure?: boolean;
}

export interface SecurityHeaderOptions extends CspOptions {
  hsts: boolean;
}

const HSTS_MAX_AGE_SECONDS = 63072000;

export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function buildCsp({ nonce, dev, imgOrigins, upgradeInsecure = !dev }: CspOptions): string {
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(dev ? ["'unsafe-eval'"] : []),
  ];
  const directives: Array<[string, string[]]> = [
    ["default-src", ["'self'"]],
    ["script-src", scriptSrc],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "blob:", ...imgOrigins]],
    ["font-src", ["'self'"]],
    ["connect-src", ["'self'", ...(dev ? ["ws:", "wss:"] : [])]],
    ["worker-src", ["'self'", "blob:"]],
    ["manifest-src", ["'self'"]],
    ["media-src", ["'self'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
  ];
  if (upgradeInsecure) directives.push(["upgrade-insecure-requests", []]);
  return directives.map(([name, values]) => [name, ...values].join(" ")).join("; ");
}

export function securityHeaders(options: SecurityHeaderOptions): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Security-Policy": buildCsp({ ...options, upgradeInsecure: options.hsts }),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(self), microphone=(), geolocation=(), payment=()",
    "Cross-Origin-Opener-Policy": "same-origin",
  };
  if (options.hsts) {
    headers["Strict-Transport-Security"] =
      `max-age=${HSTS_MAX_AGE_SECONDS}; includeSubDomains; preload`;
  }
  return headers;
}
