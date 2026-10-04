"use client";

import { useEffect, type ReactNode } from "react";
import { FINE_POINTER_QUERY, readEffectsOff } from "./hooks";
import { pointerFraction } from "./math";

/**
 * One passive, rAF throttled pointermove listener for the whole app. It writes the position inside
 * the hovered surface to --px/--py (0..1) on elements marked data-pointer-surface. Components read
 * these in CSS, so there are no per element listeners and no React re-renders. Nothing is written
 * to <html>: a custom property changed on the root restyles the whole document on every frame.
 */
export function PointerProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (!window.matchMedia(FINE_POINTER_QUERY).matches || readEffectsOff()) return;

    let frame = 0;
    let latest: PointerEvent | null = null;
    let active: HTMLElement | null = null;

    const resetSurface = (surface: HTMLElement) => {
      surface.style.removeProperty("--px");
      surface.style.removeProperty("--py");
    };

    const flush = () => {
      frame = 0;
      const event = latest;
      if (!event) return;
      const surface =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>("[data-pointer-surface]")
          : null;
      if (active && active !== surface) resetSurface(active);
      if (surface) {
        const fraction = pointerFraction(
          event.clientX,
          event.clientY,
          surface.getBoundingClientRect(),
        );
        surface.style.setProperty("--px", fraction.x.toFixed(3));
        surface.style.setProperty("--py", fraction.y.toFixed(3));
      }
      active = surface;
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      latest = event;
      if (!frame) frame = requestAnimationFrame(flush);
    };

    document.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      document.removeEventListener("pointermove", onMove);
      if (frame) cancelAnimationFrame(frame);
      if (active) resetSurface(active);
    };
  }, []);

  return children;
}
