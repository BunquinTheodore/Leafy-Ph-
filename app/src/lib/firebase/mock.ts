/**
 * Fake Google sign in for tests and local development (NEXT_PUBLIC_AUTH_MOCK=1 builds only).
 *
 * It mints a Firebase shaped ID token signed HS256 with a fixed TEST key. The API accepts that
 * key only when GOOGLE_MOCK=1, and refuses to start in that mode when ENV=prod. The key is not a
 * secret: it protects nothing outside mock mode.
 */
const MOCK_SIGNING_KEY = "leafy-mock-firebase-signing-key";
const MOCK_KEY_ID = "leafy-mock";
const FALLBACK_PROJECT_ID = "leafy-mock";
const DEFAULT_EMAIL = "dev@example.com";
const TOKEN_LIFETIME_SECONDS = 3600;
const EMAIL_PARAM = "mock_google_email";
const EMAIL_SHAPE = /^[^\s@]{1,64}@[^\s@]{1,190}$/;
const ID_HEX_LENGTH = 20;

const encoder = new TextEncoder();

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const jsonPart = (value: unknown): string => base64Url(encoder.encode(JSON.stringify(value)));

async function stableId(email: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(email));
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return `mock-${hex.slice(0, ID_HEX_LENGTH)}`;
}

/** The identity to sign in as: `?mock_google_email=` on the current page, else a dev account. */
export function mockEmailFrom(search: string): string {
  const requested = new URLSearchParams(search).get(EMAIL_PARAM) ?? "";
  return EMAIL_SHAPE.test(requested) ? requested.toLowerCase() : DEFAULT_EMAIL;
}

export async function mockGoogleIdToken(options: {
  search: string;
  projectId?: string;
  nowSeconds?: number;
}): Promise<string> {
  const email = mockEmailFrom(options.search);
  const projectId = options.projectId || FALLBACK_PROJECT_ID;
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const uid = await stableId(email);
  const header = { alg: "HS256", typ: "JWT", kid: MOCK_KEY_ID };
  const claims = {
    iss: `https://securetoken.google.com/${projectId}`,
    aud: projectId,
    sub: uid,
    user_id: uid,
    iat: now,
    auth_time: now,
    exp: now + TOKEN_LIFETIME_SECONDS,
    email,
    email_verified: true,
    name: "Mock Googler",
    firebase: { sign_in_provider: "google.com", identities: {} },
  };
  const signingInput = `${jsonPart(header)}.${jsonPart(claims)}`;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(MOCK_SIGNING_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(signingInput));
  return `${signingInput}.${base64Url(new Uint8Array(signature))}`;
}
