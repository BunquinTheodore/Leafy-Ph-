import { z } from "zod";

/**
 * Hand typed from the plan's REST contract until the openapi-typescript output
 * (src/lib/api/schema.d.ts) lands. Session fields are an assumption flagged in the handoff.
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
  auth_methods: z.array(z.enum(["password", "google"])),
});

export const sessionTokensSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().int().positive(),
});

export const authSessionSchema = sessionTokensSchema.extend({
  token_type: z.string().optional(),
  user: userSchema,
});

export type UserOut = z.infer<typeof userSchema>;
export type SessionTokens = z.infer<typeof sessionTokensSchema>;
export type AuthSessionOut = z.infer<typeof authSessionSchema>;
