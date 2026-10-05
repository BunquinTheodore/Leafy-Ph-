export interface CspOptions {
  nonce: string;
  dev: boolean;
  imgOrigins: readonly string[];
  /**
   * Host of the Firebase auth domain (e.g. leafy-8ecd6.firebaseapp.com). When set, the CSP gains
   * exactly what Firebase popup sign in needs and nothing broader. Empty or missing adds nothing.
   */
  firebaseAuthDomain?: string;
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

/** Firebase popup sign in: token endpoints, the helper iframe and the gapi loader. */
const FIREBASE_CONNECT = [
  "https://identitytoolkit.googleapis.com",
  "https://securetoken.googleapis.com",
  "https://www.googleapis.com",
] as const;
const FIREBASE_FRAME = "https://accounts.google.com";
/** Loaded by the SDK for popups. Explicit for CSP2 browsers; strict-dynamic covers the rest. */
const FIREBASE_SCRIPT = "https://apis.google.com";

export function buildCsp({
  nonce,
  dev,
  imgOrigins,
  firebaseAuthDomain = "",
  upgradeInsecure = !dev,
}: CspOptions): string {
  const firebase = firebaseAuthDomain !== "";
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(firebase ? [FIREBASE_SCRIPT] : []),
    ...(dev ? ["'unsafe-eval'"] : []),
  ];
  const directives: Array<[string, string[]]> = [
    ["default-src", ["'self'"]],
    ["script-src", scriptSrc],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "blob:", ...imgOrigins]],
    ["font-src", ["'self'"]],
    [
      "connect-src",
      ["'self'", ...(firebase ? FIREBASE_CONNECT : []), ...(dev ? ["ws:", "wss:"] : [])],
    ],
    ...(firebase
      ? ([["frame-src", [`https://${firebaseAuthDomain}`, FIREBASE_FRAME]]] as Array<
          [string, string[]]
        >)
      : []),
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
    // allow-popups keeps isolation but lets the Firebase sign in popup talk back to this page.
    "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
  };
  if (options.hsts) {
    headers["Strict-Transport-Security"] =
      `max-age=${HSTS_MAX_AGE_SECONDS}; includeSubDomains; preload`;
  }
  return headers;
}
