"use client";

import { useEffect } from "react";

const SETTLE_MS = 80;

/**
 * Panel ids double as URL hashes, and browsers answer a hash by scrolling the document to that
 * element. These pages are single viewport stages, so the page stays at the top and only the
 * panels move sideways.
 */
export function ScrollGuard() {
  useEffect(() => {
    const reset = () => {
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };
    const onHash = () => requestAnimationFrame(reset);
    reset();
    const timer = window.setTimeout(reset, SETTLE_MS);
    window.addEventListener("hashchange", onHash);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("hashchange", onHash);
    };
  }, []);
  return null;
}
