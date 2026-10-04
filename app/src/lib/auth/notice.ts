/**
 * One time notices that follow a redirect, such as the Google welcome. The value is a fixed
 * keyword (never user data) in a short lived cookie that the browser reads once and removes.
 */
export const NOTICE_COOKIE = "leafy_notice";
export const NOTICE_MAX_AGE_SECONDS = 120;

export type FlashNotice = "google_welcome" | "google_linked";

const NOTICES: readonly FlashNotice[] = ["google_welcome", "google_linked"];

export function isFlashNotice(value: string | undefined | null): value is FlashNotice {
  return NOTICES.includes(value as FlashNotice);
}

/** What the Google sign in did to the account, as reported by the API. */
export function noticeAfterGoogle(result: {
  isNewUser: boolean;
  linkedExistingAccount: boolean;
}): FlashNotice | null {
  if (result.isNewUser) return "google_welcome";
  if (result.linkedExistingAccount) return "google_linked";
  return null;
}

/** Reads the notice keyword from a `document.cookie` style string. */
export function readNotice(cookieHeader: string): FlashNotice | null {
  for (const part of cookieHeader.split(";")) {
    const [name, value] = part.trim().split("=");
    if (name === NOTICE_COOKIE && isFlashNotice(value)) return value;
  }
  return null;
}

export const NOTICE_TEXT: Record<FlashNotice, string> = {
  google_welcome:
    "Welcome to Leafy. You are signed in with Google. You can add a password any time in Account.",
  google_linked:
    "You are signed in with Google. We linked it to your existing Leafy account with the same email.",
};
