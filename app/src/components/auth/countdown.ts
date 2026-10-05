"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** "1:05" style clock for rate limit notes. */
export function formatCountdown(totalSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

const TICK_MS = 1000;

/** Counts whole seconds down to zero from a deadline, so a throttled tab never drifts. */
export function useCountdown(): { remaining: number; start: (seconds: number) => void } {
  const [remaining, setRemaining] = useState(0);
  const deadline = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timer.current !== null) clearInterval(timer.current);
    timer.current = null;
  }, []);

  const start = useCallback(
    (seconds: number) => {
      stop();
      const total = Math.max(0, Math.ceil(seconds));
      deadline.current = Date.now() + total * TICK_MS;
      setRemaining(total);
      if (total === 0) return;
      timer.current = setInterval(() => {
        const left = Math.max(0, Math.ceil((deadline.current - Date.now()) / TICK_MS));
        setRemaining(left);
        if (left === 0) stop();
      }, TICK_MS);
    },
    [stop],
  );

  useEffect(() => stop, [stop]);

  return { remaining, start };
}
