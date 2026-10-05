import { sanitizeNext } from "@/lib/http/safe-redirect";
import { enAuth } from "@/lib/i18n/auth.en";

type QueryValue = string | string[] | undefined;

export interface AuthNote {
  tone: "info" | "warning" | "error";
  text: string;
}

const hasOwn = (record: object, key: string) => Object.prototype.hasOwnProperty.call(record, key);

/** Our own copy for an API error code (never the raw server message). */
export function messageForCode(code: string): string {
  return hasOwn(enAuth.errors, code)
    ? enAuth.errors[code as keyof typeof enAuth.errors]
    : enAuth.errors.fallback;
}

const NOTE_TONES: Record<keyof typeof enAuth.notes, AuthNote["tone"]> = {
  session_expired: "info",
  session_revoked: "info",
  google_cancelled: "info",
  google_auth_failed: "error",
  google_email_unverified: "error",
  google_unavailable: "warning",
  rate_limited: "warning",
};

const single = (value: QueryValue): string | undefined =>
  typeof value === "string" ? value : undefined;

function toNote(key: string | undefined): AuthNote | null {
  if (!key || !hasOwn(enAuth.notes, key)) return null;
  const typed = key as keyof typeof enAuth.notes;
  return { tone: NOTE_TONES[typed], text: enAuth.notes[typed] };
}

/**
 * The calm note shown above the sign in form: a Google outcome (`error`) or why the session ended
 * (`reason`). Only known keys are shown, so query strings can never inject text.
 */
export function noteFromParams(params: {
  error?: QueryValue;
  reason?: QueryValue;
}): AuthNote | null {
  return toNote(single(params.error)) ?? toNote(single(params.reason));
}

/** Links between auth pages keep a safe `next` so the return trip survives sign in, sign up and reset. */
export function buildAuthHref(path: string, next: string | undefined): string {
  const safe = sanitizeNext(next, "");
  return safe ? `${path}?next=${encodeURIComponent(safe)}` : path;
}
