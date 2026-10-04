import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/components/ui/password-score";
import { enAuth } from "@/lib/i18n/auth.en";

const MAX_NAME_LENGTH = 100;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Each validator returns an error message, or null when the value is fine. */
export function validateEmail(value: string): string | null {
  const email = value.trim();
  if (email.length === 0) return enAuth.errors.emailRequired;
  return EMAIL_PATTERN.test(email) ? null : enAuth.errors.emailInvalid;
}

export function validateName(value: string): string | null {
  const name = value.trim();
  if (name.length === 0) return enAuth.errors.nameRequired;
  return name.length > MAX_NAME_LENGTH ? enAuth.errors.nameLong : null;
}

export function validateLoginPassword(value: string): string | null {
  return value.length === 0 ? enAuth.errors.passwordRequired : null;
}

/** Mirrors the API rules the browser can check (length, not the email). The API stays the judge. */
export function validateNewPassword(value: string, email: string): string | null {
  if (value.length === 0) return enAuth.errors.passwordRequired;
  if (value.length < MIN_PASSWORD_LENGTH) return enAuth.errors.passwordShort;
  if (value.length > MAX_PASSWORD_LENGTH) return enAuth.errors.passwordLong;
  const address = email.trim().toLowerCase();
  if (address && value.toLowerCase().includes(address)) return enAuth.errors.passwordHasEmail;
  return null;
}

/** One "Your name" field becomes the API's first and last name. */
export function splitName(value: string): { first_name: string; last_name: string } {
  const [first = "", ...rest] = value.trim().split(/\s+/).filter(Boolean);
  return {
    first_name: first.slice(0, MAX_NAME_LENGTH),
    last_name: rest.join(" ").slice(0, MAX_NAME_LENGTH),
  };
}
