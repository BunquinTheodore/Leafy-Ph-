"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { LogoMark } from "../brand/Logo";
import { useDeferredMount } from "../three/deferred-mount";

const AuthBackdropCanvas = dynamic(() => import("./AuthBackdropCanvas"), { ssr: false });

/**
 * Decorative backdrop. The static poster (mark and glow) is in the HTML, so the page never waits
 * for WebGL; the leaves load once the page has settled and fade in over it. No WebGL keeps the poster.
 */
export function AuthBackdrop() {
  const mounted = useDeferredMount();
  const [ready, setReady] = useState(false);

  return (
    <div className="auth-backdrop" data-ready={ready} aria-hidden="true">
      <div className="auth-backdrop__poster">
        <LogoMark height={260} />
      </div>
      <div className="auth-backdrop__canvas">
        {mounted ? <AuthBackdropCanvas onReady={() => setReady(true)} /> : null}
      </div>
    </div>
  );
}
