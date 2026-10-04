export type ViewportSize = "phone" | "tablet" | "desktop";

const PHONE_AGENT = /Mobi|Android.+Mobile|iPhone|iPod/i;

interface HintHeaders {
  get(name: string): string | null;
}

/**
 * Best server side guess of the viewport class, so the first paint already has the right number
 * of cards per panel. Chromium sends `Sec-CH-UA-Mobile` on every request; other browsers are
 * matched on the user agent. The client corrects the guess after hydration when it is wrong
 * (for example a narrow desktop window).
 */
export function guessViewportSize(headers: HintHeaders): ViewportSize {
  const mobileHint = headers.get("sec-ch-ua-mobile");
  if (mobileHint === "?1") return "phone";
  if (mobileHint === "?0") return "desktop";
  return PHONE_AGENT.test(headers.get("user-agent") ?? "") ? "phone" : "desktop";
}
