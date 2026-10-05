import { z } from "zod";

const DEFAULT_MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_ALLOWED_UPLOAD_BYTES = 64 * 1024 * 1024;
const MAX_TRUSTED_PROXY_HOPS = 5;

/** A bare DNS host (no scheme, path or port) so it can only ever become one CSP host source. */
const HOSTNAME = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i;

const truthy = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((value) => value === true || value === "1" || value === "true");

const trimmedUrl = z
  .string()
  .url()
  .transform((value) => value.replace(/\/+$/, ""));

const mockRequested = (value: { GOOGLE_MOCK: boolean; NEXT_PUBLIC_AUTH_MOCK: boolean }) =>
  value.GOOGLE_MOCK || value.NEXT_PUBLIC_AUTH_MOCK;

const schema = z
  .object({
    API_INTERNAL_URL: trimmedUrl,
    APP_ORIGIN: trimmedUrl,
    ENV: z.string().optional(),
    COOKIE_SECURE: truthy,
    COOKIE_PREFIX: z.enum(["", "__Host-"]).optional().default(""),
    MAX_UPLOAD_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .max(MAX_ALLOWED_UPLOAD_BYTES)
      .optional()
      .default(DEFAULT_MAX_UPLOAD_BYTES),
    GOOGLE_MOCK: truthy,
    NEXT_PUBLIC_AUTH_MOCK: truthy,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z
      .string()
      .trim()
      .regex(HOSTNAME, "must be a bare host name such as your-project.firebaseapp.com")
      .or(z.literal(""))
      .optional()
      .default(""),
    TRUSTED_PROXY_HOPS: z.coerce
      .number()
      .int()
      .min(0)
      .max(MAX_TRUSTED_PROXY_HOPS)
      .optional()
      .default(0),
  })
  .refine((value) => !(mockRequested(value) && value.COOKIE_SECURE), {
    message: "GOOGLE_MOCK / NEXT_PUBLIC_AUTH_MOCK must not be enabled when COOKIE_SECURE=true",
    path: ["GOOGLE_MOCK"],
  })
  .refine((value) => !(mockRequested(value) && value.ENV === "prod"), {
    message: "GOOGLE_MOCK / NEXT_PUBLIC_AUTH_MOCK must not be enabled when ENV=prod",
    path: ["GOOGLE_MOCK"],
  })
  .refine((value) => value.COOKIE_PREFIX === "" || value.COOKIE_SECURE, {
    message: "COOKIE_PREFIX=__Host- requires COOKIE_SECURE=true",
    path: ["COOKIE_PREFIX"],
  });

export interface AppEnv {
  readonly apiBaseUrl: string;
  readonly appOrigin: string;
  readonly cookieSecure: boolean;
  readonly cookiePrefix: "" | "__Host-";
  readonly maxUploadBytes: number;
  /** Fake Google sign in for tests and local development. Never true in production. */
  readonly googleMock: boolean;
  /** Firebase auth domain (host only) for the CSP; empty when Google sign in is not configured. */
  readonly firebaseAuthDomain: string;
  /** Reverse proxies in front of Next whose X-Forwarded-For entry is trusted. 0 means none. */
  readonly trustedProxyHops: number;
}

/** Parses and validates a raw environment record. Throws a ZodError that names the bad key. */
export function parseEnv(source: Record<string, string | undefined>): AppEnv {
  const parsed = schema.parse(source);
  return Object.freeze({
    apiBaseUrl: `${parsed.API_INTERNAL_URL}/api/v1`,
    appOrigin: parsed.APP_ORIGIN,
    cookieSecure: parsed.COOKIE_SECURE,
    cookiePrefix: parsed.COOKIE_PREFIX,
    maxUploadBytes: parsed.MAX_UPLOAD_BYTES,
    googleMock: parsed.GOOGLE_MOCK || parsed.NEXT_PUBLIC_AUTH_MOCK,
    firebaseAuthDomain: parsed.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN.toLowerCase(),
    trustedProxyHops: parsed.TRUSTED_PROXY_HOPS,
  });
}

let cached: AppEnv | undefined;

/** Server only. Validated once per process; fails fast with a clear message. */
export function getEnv(): AppEnv {
  cached ??= parseEnv({
    API_INTERNAL_URL: process.env.API_INTERNAL_URL,
    APP_ORIGIN: process.env.APP_ORIGIN,
    ENV: process.env.ENV,
    COOKIE_SECURE: process.env.COOKIE_SECURE,
    COOKIE_PREFIX: process.env.COOKIE_PREFIX,
    MAX_UPLOAD_BYTES: process.env.MAX_UPLOAD_BYTES,
    GOOGLE_MOCK: process.env.GOOGLE_MOCK,
    NEXT_PUBLIC_AUTH_MOCK: process.env.NEXT_PUBLIC_AUTH_MOCK,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    TRUSTED_PROXY_HOPS: process.env.TRUSTED_PROXY_HOPS,
  });
  return cached;
}
