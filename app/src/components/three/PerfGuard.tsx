"use client";

import { useThree } from "@react-three/fiber";
import { useEffect } from "react";

/**
 * Pauses rendering while the canvas is off screen or the tab is hidden, and resumes when it is
 * visible again. `animated` false keeps the loop on demand (reduced motion, static scenes).
 */
export function PerfGuard({ animated = true }: { animated?: boolean }) {
  const canvas = useThree((state) => state.gl.domElement);
  const setFrameloop = useThree((state) => state.setFrameloop);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    if (!animated) {
      setFrameloop("demand");
      invalidate();
      return;
    }
    let onScreen = true;
    const apply = () => setFrameloop(onScreen && !document.hidden ? "always" : "never");
    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry?.isIntersecting ?? true;
      apply();
    });
    observer.observe(canvas);
    document.addEventListener("visibilitychange", apply);
    apply();
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", apply);
    };
  }, [animated, canvas, invalidate, setFrameloop]);

  return null;
}
