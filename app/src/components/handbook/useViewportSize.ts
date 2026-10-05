"use client";

import { useSyncExternalStore } from "react";
import type { ViewportSize } from "@/lib/handbook/device";

const DESKTOP_QUERY = "(min-width: 1100px)";
const TABLET_QUERY = "(min-width: 700px)";

function subscribe(onChange: () => void): () => void {
  const lists = [window.matchMedia(DESKTOP_QUERY), window.matchMedia(TABLET_QUERY)];
  for (const list of lists) list.addEventListener("change", onChange);
  return () => {
    for (const list of lists) list.removeEventListener("change", onChange);
  };
}

function snapshot(): ViewportSize {
  if (window.matchMedia(DESKTOP_QUERY).matches) return "desktop";
  return window.matchMedia(TABLET_QUERY).matches ? "tablet" : "phone";
}

/**
 * The viewport class that decides how many cards or list items fit on one sideways panel.
 * `initial` is the server's guess, used for the first render so hydration matches the HTML;
 * the real size takes over right after.
 */
export function useViewportSize(initial: ViewportSize = "desktop"): ViewportSize {
  return useSyncExternalStore(subscribe, snapshot, () => initial);
}

const ULTRA_QUERY = "(min-width: 1900px)";

function subscribeUltra(onChange: () => void): () => void {
  const list = window.matchMedia(ULTRA_QUERY);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

/** True on screens 1900px and wider, where the plant catalog shows six cards per page. */
export function useUltraWide(): boolean {
  return useSyncExternalStore(
    subscribeUltra,
    () => window.matchMedia(ULTRA_QUERY).matches,
    () => false,
  );
}
