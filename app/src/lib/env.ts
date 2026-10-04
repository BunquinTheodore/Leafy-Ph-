import { z } from "zod";

const DEFAULT_MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_ALLOWED_UPLOAD_BYTES = 64 * 1024 * 1024;
const MAX_TRUSTED_PROXY_HOPS = 5;

const truthy = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((value) => value === true || value === "1" || value === "true");

const trimmedUrl = z
  .string()
  .url()
  .transform((value) => value.replace(/\/+$/, ""));

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
    GOOGLE_CLIENT_ID: z.string().optional().default(""),
    GOOGLE_REDIRECT_URI: z.string().url().optional(),
    GOOGLE_MOCK: truthy,
    TRUSTED_PROXY_HOPS: z.coerce
      .number()
      .int()
      .min(0)
      .max(MAX_TRUSTED_PROXY_HOPS)
      .optional()
      .default(0),
  })
  .refine((value) => !(value.GOOGLE_MOCK && value.COOKIE_SECURE), {
    message: "GOOGLE_MOCK must not be enabled when COOKIE_SECURE=true (production)",
    path: ["GOOGLE_MOCK"],
  })
  .refine((value) => !(value.GOOGLE_MOCK && value.ENV === "prod"), {
    message: "GOOGLE_MOCK must not be enabled when ENV=prod",
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
  readonly googleClientId: string;
  readonly googleRedirectUri: string;
  readonly googleMock: boolean;
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
    googleClientId: parsed.GOOGLE_CLIENT_ID,
    googleRedirectUri:
      parsed.GOOGLE_REDIRECT_URI ?? `${parsed.APP_ORIGIN}/api/auth/google/callback`,
    googleMock: parsed.GOOGLE_MOCK,
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
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
    GOOGLE_MOCK: process.env.GOOGLE_MOCK,
    TRUSTED_PROXY_HOPS: process.env.TRUSTED_PROXY_HOPS,
  });
  return cached;
}
