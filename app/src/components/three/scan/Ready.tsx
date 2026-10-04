"use client";

import { useEffect } from "react";

/** Rendered inside the scene's Suspense boundary, so it only mounts once the photo texture is loaded. */
export function Ready({ onReady }: { onReady: () => void }) {
  useEffect(() => {
    onReady();
  }, [onReady]);
  return null;
}
