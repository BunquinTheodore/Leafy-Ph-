import { Alert } from "../ui/Display";
import { enAuth } from "@/lib/i18n/auth.en";
import { formatCountdown } from "./countdown";

/**
 * Rate limit alert with a live clock. Screen readers hear the message once; the ticking digits
 * are hidden from them so they are not read out every second.
 */
export function RateLimitNote({ remaining }: { remaining: number }) {
  return (
    <Alert tone="warning">
      <span className="sr-only">{enAuth.errors.rate_limited}</span>
      <span aria-hidden="true">
        {enAuth.errors.rate_limited} {enAuth.countdown.prefix}{" "}
        <strong className="stat">{formatCountdown(remaining)}</strong>.
      </span>
    </Alert>
  );
}
