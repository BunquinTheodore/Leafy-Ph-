"use client";

import { useSyncExternalStore } from "react";
import { effectsAllowed } from "./math";

function subscribeMedia(query: string, onChange: () => void): () => void {
  const list = window.matchMedia(query);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

/** Subscribes to a media query. The server snapshot is `false`, so first paint matches SSR. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => subscribeMedia(query, onChange),
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export const FINE_POINTER_QUERY = "(hover: hover) and (pointer: fine)";

export const useFinePointer = (): boolean => useMediaQuery(FINE_POINTER_QUERY);
export const usePrefersReducedMotion = (): boolean =>
  useMediaQuery("(prefers-reduced-motion: reduce)");

/** True when the head script marked effects off (Lighthouse, webdriver, ?nosplash). */
export function readEffectsOff(): boolean {
  return document.documentElement.getAttribute("data-fx") === "off";
}

/** Combined gate for decorative, cursor reactive effects. */
export function useEffectsAllowed(): boolean {
  const finePointer = useFinePointer();
  const reducedMotion = usePrefersReducedMotion();
  const effectsOff = useSyncExternalStore(
    () => () => undefined,
    readEffectsOff,
    () => false,
  );
  return effectsAllowed({ finePointer, reducedMotion, effectsOff });
}
