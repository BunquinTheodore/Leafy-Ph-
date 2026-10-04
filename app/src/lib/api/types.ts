import { z } from "zod";
import "../zod-config";

/**
 * Runtime validators for the replies the web layer relies on. The wire format is api/openapi.json
 * (types generated into schema.d.ts by `pnpm api:types`); src/lib/api/contract.test.ts fails when
 * these schemas drift from it. `expires_in` is the access lifetime in seconds, `refresh_expires_at`
 * an ISO date.
 */
export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
  request_id?: string;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error: ApiErrorBody | null;
}

export type AuthMethod = "password" | "google";

export const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  email_verified: z.boolean(),
  email_verified_at: z.string().nullable().optional(),
  created_at: z.string().optional(),
  auth_methods: z.array(z.enum(["password", "google"])),
});

/** What the cookies layer needs from any session style reply. */
export const sessionTokensSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  refresh_expires_at: z.string().nullable().optional(),
});

/** `POST /auth/register` and `POST /auth/login`. */
export const authSessionSchema = sessionTokensSchema.extend({
  token_type: z.string().optional(),
  refresh_expires_at: z.string(),
  user: userSchema,
});

/** `POST /auth/google`: a session plus what happened to the account. */
export const googleSessionSchema = authSessionSchema.extend({
  is_new_user: z.boolean(),
  linked_existing_account: z.boolean(),
});

/**
 * `POST /auth/refresh`. The refresh token and its expiry are null when a concurrent rotation was
 * answered inside the grace window: the caller keeps the refresh token it already holds.
 */
export const refreshOutSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).nullable(),
  token_type: z.string().optional(),
  expires_in: z.number().int().positive(),
  refresh_expires_at: z.string().nullable(),
});

export type UserOut = z.infer<typeof userSchema>;
export type SessionTokens = z.infer<typeof sessionTokensSchema>;
export type AuthSessionOut = z.infer<typeof authSessionSchema>;
export type GoogleSessionOut = z.infer<typeof googleSessionSchema>;
export type RefreshOut = z.infer<typeof refreshOutSchema>;
