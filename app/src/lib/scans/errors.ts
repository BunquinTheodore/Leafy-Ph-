import type { BrowserApiError } from "@/lib/api/browser";

export type ScanErrorKind =
  | "unverified"
  | "rate_limited"
  | "quota"
  | "invalid_image"
  | "too_large"
  | "unsupported"
  | "storage"
  | "ml_unavailable"
  | "session"
  | "offline"
  | "generic";

export interface ScanErrorView {
  kind: ScanErrorKind;
  title: string;
  body: string;
  /** Seconds to wait before trying again (rate limits). */
  retryAfterSeconds?: number;
}

const DEFAULT_WAIT_SECONDS = 60;

/** Plain words for every error the scan journey can meet. What happened, then what to do. */
export function describeScanError(
  error: Pick<BrowserApiError, "code" | "status" | "retryAfterSeconds">,
): ScanErrorView {
  switch (error.code) {
    case "email_not_verified":
      return {
        kind: "unverified",
        title: "Verify your email to scan",
        body: "We sent you a link when you signed up. Open it, or ask for a new one below.",
      };
    case "rate_limited":
      return {
        kind: "rate_limited",
        title: "That is a lot of scans",
        body: "Give it a moment. You can scan again when the timer ends.",
        retryAfterSeconds: error.retryAfterSeconds ?? DEFAULT_WAIT_SECONDS,
      };
    case "scan_quota_exceeded":
      return {
        kind: "quota",
        title: "Your scan history is full",
        body: "Delete a few older scans in your history to make room, then scan again.",
      };
    case "invalid_image":
      return {
        kind: "invalid_image",
        title: "We could not read that photo",
        body: "Try a clear, well lit photo of one leaf, saved as a JPEG, PNG or WebP.",
      };
    case "payload_too_large":
      return {
        kind: "too_large",
        title: "That photo is too large",
        body: "Choose a photo under 8 MB, or take a new one.",
      };
    case "unsupported_media_type":
      return {
        kind: "unsupported",
        title: "That file type is not supported",
        body: "Use a JPEG, PNG or WebP photo.",
      };
    case "storage_unavailable":
      return {
        kind: "storage",
        title: "We could not save your photo",
        body: "Nothing was lost. Try again in a moment.",
      };
    case "ml_unavailable":
      return {
        kind: "ml_unavailable",
        title: "Analysis isn't available right now",
        body: "Your photo is saved. Try again a little later.",
      };
    case "not_authenticated":
    case "refresh_invalid":
    case "refresh_reuse_detected":
    case "token_expired":
    case "invalid_token":
      return {
        kind: "session",
        title: "Your session has ended",
        body: "Sign in again to continue. Your scans are safe.",
      };
    case "api_unreachable":
      return {
        kind: "offline",
        title: "We could not reach Leafy",
        body: "Check your connection and try again.",
      };
    default:
      return {
        kind: "generic",
        title: "Something went wrong",
        body: "That was on our side. Try again in a moment.",
      };
  }
}

export interface FailureView {
  title: string;
  body: string;
  /** Retry reuses the stored image, so it is offered for every failure reason. */
  canRetry: boolean;
}

/** Reason a stored scan failed, in plain words. */
export function describeFailure(failureCode: string | null): FailureView {
  if (failureCode === "ml_unavailable") {
    return {
      title: "Analysis isn't available right now",
      body: "Try again a little later, or use another photo.",
      canRetry: true,
    };
  }
  return {
    title: "We could not analyze this photo",
    body: "This sometimes happens with blurry or dark photos. Retry with the same photo, or try another one.",
    canRetry: true,
  };
}
