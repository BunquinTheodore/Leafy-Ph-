"use client";

import { useEffect } from "react";
import { useToast } from "@/components/ui/Toast";
import { NOTICE_COOKIE, NOTICE_TEXT, readNotice } from "@/lib/auth/notice";

const NOTICE_DURATION_MS = 10_000;

/**
 * Shows the one time notice left by a redirect (the Google welcome and the account linked notice)
 * as a toast, then removes the cookie so a reload never repeats it.
 */
export function FlashNotice() {
  const toast = useToast();
  useEffect(() => {
    const notice = readNotice(document.cookie);
    if (!notice) return;
    document.cookie = `${NOTICE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
    toast({ message: NOTICE_TEXT[notice], tone: "success", durationMs: NOTICE_DURATION_MS });
  }, [toast]);
  return null;
}
