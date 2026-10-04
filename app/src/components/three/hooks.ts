"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useMediaQuery, usePrefersReducedMotion } from "../interaction/hooks";
import { useTheme } from "../layout/theme";

export { usePrefersReducedMotion as useReducedMotion };

/** Small screens get fewer instances, no postprocessing and a lower triangle budget. */
export const useIsMobile = (): boolean => useMediaQuery("(max-width: 720px)");

/** ?nowebgl forces the static poster (tests and low power fallbacks). */
function detectWebGL(): boolean {
  if (/[?&]nowebgl\b/.test(window.location.search)) return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * `null` until checked on the client, then true or false. Render the poster for null and false.
 * Creating a context is slow on machines with software GL (it blocked the main thread for
 * seconds in lab runs), so callers that are not about to draw pass `active = false` until they are.
 */
export function useWebGLSupport(active = true): boolean | null {
  const [supported, setSupported] = useState<boolean | null>(null);
  useEffect(() => {
    if (active) setSupported(detectWebGL());
  }, [active]);
  return supported;
}

export interface SceneColors {
  bg: string;
  brand: string;
  glow: string;
  deep: string;
  text: string;
  dark: boolean;
}

function readColors(): SceneColors {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    bg: read("--bg", "#06120b"),
    brand: read("--brand", "#40c057"),
    glow: read("--brand-glow", "#7be495"),
    deep: read("--brand-deep", "#1f6b3a"),
    text: read("--text", "#e9f4ec"),
    dark: document.documentElement.getAttribute("data-theme") !== "light",
  };
}

const SERVER_COLORS: SceneColors = {
  bg: "#06120b",
  brand: "#40c057",
  glow: "#7be495",
  deep: "#1f6b3a",
  text: "#e9f4ec",
  dark: true,
};

/** Scene palette read from the CSS tokens, so scenes switch with the theme (palette stays locked). */
export function useSceneColors(): SceneColors {
  const theme = useTheme();
  const [colors, setColors] = useState<SceneColors>(SERVER_COLORS);
  useEffect(() => setColors(readColors()), [theme]);
  return colors;
}

/** Only one WebGL canvas should render per page; later ones stay on the poster until it is free. */
const activeCanvases = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

function subscribeToCanvases(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function useSingleActiveCanvas(id: string): boolean {
  useEffect(() => {
    let alive = true;
    // A canvas that mounted while another was active claims the slot as soon as it is free.
    const claim = () => {
      if (!alive || activeCanvases.size > 0) return;
      activeCanvases.add(id);
      emit();
    };
    claim();
    listeners.add(claim);
    return () => {
      alive = false;
      listeners.delete(claim);
      if (activeCanvases.delete(id)) emit();
    };
  }, [id]);
  return useSyncExternalStore(
    subscribeToCanvases,
    () => activeCanvases.has(id),
    () => true,
  );
}
