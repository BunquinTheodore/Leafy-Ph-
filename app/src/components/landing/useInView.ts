"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * True while the element is at least `threshold` visible. Scenes use it to mount their canvas
 * only on screen, which keeps one WebGL context per page while panels slide sideways.
 * Without IntersectionObserver the element counts as visible.
 */
export function useInView<T extends Element>(ref: RefObject<T | null>, threshold = 0.5): boolean {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setInView(Boolean(entry?.isIntersecting)),
      { threshold },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, threshold]);

  return inView;
}
