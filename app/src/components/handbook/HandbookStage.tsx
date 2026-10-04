"use client";

import dynamic from "next/dynamic";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useDeferredMount } from "../three/deferred-mount";
import { useReducedMotion, useWebGLSupport } from "../three/hooks";
import { ScrollGuard } from "./ScrollGuard";

const AccentCanvas = dynamic(() => import("./AccentCanvas"), { ssr: false });

interface AccentContextValue {
  /** Accents may render into the shared canvas (WebGL, motion allowed, loaded). */
  enabled: boolean;
  /** An accent that is on screen registers here and returns its release function. */
  register: () => () => void;
}

const AccentContext = createContext<AccentContextValue>({
  enabled: false,
  register: () => () => undefined,
});

export const useAccentCanvas = (): AccentContextValue => useContext(AccentContext);

/**
 * Wraps a handbook page. It owns the single shared canvas (drei View) that every leaf accent
 * draws into. The canvas is created when the first accent is on screen and hidden while none
 * is. With no WebGL or reduced motion, accents stay as the static leaf mark.
 */
export function HandbookStage({ children }: { children: ReactNode }) {
  const reducedMotion = useReducedMotion();
  const idle = useDeferredMount();
  const supported = useWebGLSupport(idle);
  const [live, setLive] = useState(0);
  const [everLive, setEverLive] = useState(false);

  const register = useCallback(() => {
    setLive((count) => count + 1);
    setEverLive(true);
    return () => setLive((count) => Math.max(0, count - 1));
  }, []);

  const enabled = supported === true && !reducedMotion && idle;
  const value = useMemo(() => ({ enabled, register }), [enabled, register]);

  return (
    <AccentContext.Provider value={value}>
      <ScrollGuard />
      {children}
      {enabled && everLive ? (
        <div hidden={live === 0}>
          <AccentCanvas />
        </div>
      ) : null}
    </AccentContext.Provider>
  );
}
