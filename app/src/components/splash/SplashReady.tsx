"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    __leafyReady?: boolean;
    __leafyReadyCheck?: () => void;
  }
}

/** Tells the splash controller the first route has hydrated. Renders nothing. */
export function SplashReady() {
  useEffect(() => {
    window.__leafyReady = true;
    window.__leafyReadyCheck?.();
  }, []);
  return null;
}
