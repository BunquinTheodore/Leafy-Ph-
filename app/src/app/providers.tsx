"use client";

import type { ReactNode } from "react";
import { FlashNotice } from "@/components/layout/FlashNotice";
import { PointerProvider } from "@/components/interaction/PointerProvider";
import { SfxProvider } from "@/components/sfx/SfxProvider";
import { SplashReady } from "@/components/splash/SplashReady";
import { ToastProvider } from "@/components/ui/Toast";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <PointerProvider>
      <SfxProvider>
        <ToastProvider>
          {children}
          <FlashNotice />
          <SplashReady />
        </ToastProvider>
      </SfxProvider>
    </PointerProvider>
  );
}
