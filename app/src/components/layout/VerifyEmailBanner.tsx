"use client";

import { MailCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { callApi } from "@/lib/api/browser";
import { member } from "@/lib/i18n/member-en";
import { RESEND_COOLDOWN_SECONDS, cooldownDeadline, secondsRemaining } from "@/lib/member/cooldown";
import { useToast } from "../ui/Toast";

const STORAGE_KEY = "leafy-resend-until";
const copy = member.banner;

function readDeadline(): number | null {
  try {
    const stored = Number.parseInt(window.sessionStorage.getItem(STORAGE_KEY) ?? "", 10);
    return Number.isFinite(stored) ? stored : null;
  } catch {
    return null;
  }
}

function writeDeadline(value: number): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // Storage blocked: the cooldown just lasts until the page reloads.
  }
}

/** Shown to members who have not verified their email. Resend has a 60 second cooldown. */
export function VerifyEmailBanner() {
  const router = useRouter();
  const toast = useToast();
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setDeadline(readDeadline());
    setNow(Date.now());
  }, []);

  const remaining = secondsRemaining(deadline, now);

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [remaining]);

  const startCooldown = useCallback((seconds: number) => {
    const until = cooldownDeadline(Date.now(), seconds);
    writeDeadline(until);
    setDeadline(until);
    setNow(Date.now());
  }, []);

  async function resend() {
    if (busy || remaining > 0) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await callApi("/api/auth/resend-verification", { method: "POST" });
    setBusy(false);
    if (result.ok) {
      startCooldown(RESEND_COOLDOWN_SECONDS);
      setNotice(copy.sent);
      toast({ message: copy.sent, tone: "success" });
      return;
    }
    const { code, retryAfterSeconds, message } = result.error;
    if (code === "already_verified") {
      toast({ message: copy.already, tone: "info" });
      router.refresh();
      return;
    }
    if (code === "rate_limited") {
      startCooldown(retryAfterSeconds ?? RESEND_COOLDOWN_SECONDS);
      return;
    }
    setError(message);
  }

  const waiting = remaining > 0;
  return (
    <section className="verify-banner" aria-label={copy.label}>
      <MailCheck size={20} strokeWidth={1.5} aria-hidden="true" className="verify-banner__icon" />
      <p className="verify-banner__text m-0" role={error ? "alert" : "status"}>
        {error ?? notice ?? copy.message}
      </p>
      <button
        type="button"
        className="btn btn-secondary btn-sm pressable"
        onClick={resend}
        disabled={busy || waiting}
        aria-busy={busy || undefined}
        data-sfx="click"
      >
        {waiting ? copy.resendIn(remaining) : copy.resend}
      </button>
    </section>
  );
}
