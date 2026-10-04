"use client";

import { MailCheck, TimerReset } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { callApi } from "@/lib/api/browser";
import { scanCopy } from "@/lib/i18n/scan-en";
import type { ScanErrorView } from "@/lib/scans/errors";
import { RESEND_COOLDOWN_SECONDS, cooldownDeadline, secondsRemaining } from "@/lib/member/cooldown";
import { Button } from "../ui/Button";
import { Alert } from "../ui/Display";
import { useToast } from "../ui/Toast";
import { useNow } from "./hooks";

const copy = scanCopy.unverified;
const limits = scanCopy.limits;
/** Same key as the verify banner, so the two share one cooldown. */
const STORAGE_KEY = "leafy-resend-until";

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
    // Storage blocked: the cooldown lasts until the page reloads.
  }
}

/** Inline prompt for a member whose email is not verified yet: explains, and offers Resend. */
export function UnverifiedPrompt({ title, body }: { title: string; body: string }) {
  const toast = useToast();
  const [deadline, setDeadline] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const now = useNow(1000, deadline !== null);

  useEffect(() => setDeadline(readDeadline()), []);

  const remaining = secondsRemaining(deadline, now || Date.now());

  const start = useCallback((seconds: number) => {
    const until = cooldownDeadline(Date.now(), seconds);
    writeDeadline(until);
    setDeadline(until);
  }, []);

  async function resend() {
    if (busy || remaining > 0) return;
    setBusy(true);
    setFailed(null);
    const result = await callApi("/api/auth/resend-verification", { method: "POST" });
    setBusy(false);
    if (result.ok) {
      start(RESEND_COOLDOWN_SECONDS);
      setMessage(copy.sent);
      toast({ message: copy.sent, tone: "success" });
      return;
    }
    if (result.error.code === "already_verified") {
      setMessage(copy.already);
      return;
    }
    if (result.error.code === "rate_limited") {
      start(result.error.retryAfterSeconds ?? RESEND_COOLDOWN_SECONDS);
      return;
    }
    setFailed(result.error.message);
  }

  return (
    <div className="notice card card-glass" data-testid="unverified-prompt">
      <MailCheck size={32} strokeWidth={1.5} aria-hidden="true" className="notice__icon" />
      <h2 className="h3">{title}</h2>
      <p className="m-0">{body}</p>
      <Button
        variant="secondary"
        onClick={resend}
        disabled={busy || remaining > 0}
        loading={busy}
        data-testid="resend-verification"
      >
        {remaining > 0 ? copy.resendIn(remaining) : copy.resend}
      </Button>
      <p className="notice__status m-0" role={failed ? "alert" : "status"}>
        {failed ?? message ?? ""}
      </p>
    </div>
  );
}

function RateLimitPrompt({ view, onRetry }: { view: ScanErrorView; onRetry: () => void }) {
  const [deadline] = useState(() => cooldownDeadline(Date.now(), view.retryAfterSeconds ?? 60));
  const now = useNow(500);
  const remaining = secondsRemaining(deadline, now || Date.now());
  return (
    <div className="notice card card-glass" data-testid="rate-limit-prompt">
      <TimerReset size={32} strokeWidth={1.5} aria-hidden="true" className="notice__icon" />
      <h2 className="h3">{view.title}</h2>
      <p className="m-0">{view.body}</p>
      <p
        className="notice__status stat m-0"
        role="timer"
        aria-live="off"
        data-testid="rate-limit-countdown"
      >
        {remaining > 0 ? limits.waitIn(remaining) : limits.ready}
      </p>
      <Button onClick={onRetry} disabled={remaining > 0}>
        {limits.tryAgain}
      </Button>
    </div>
  );
}

interface ScanErrorPanelProps {
  view: ScanErrorView;
  onRetry: () => void;
  onChooseAnother?: () => void;
}

/** What went wrong and what to do next, for every error a scan can meet. */
export function ScanErrorPanel({ view, onRetry, onChooseAnother }: ScanErrorPanelProps) {
  if (view.kind === "unverified") return <UnverifiedPrompt title={view.title} body={view.body} />;
  if (view.kind === "rate_limited") return <RateLimitPrompt view={view} onRetry={onRetry} />;
  return (
    <div className="notice card card-glass" data-testid="scan-error" data-kind={view.kind}>
      <Alert tone={view.kind === "ml_unavailable" ? "warning" : "error"} title={view.title}>
        {view.body}
      </Alert>
      <div className="notice__actions">
        {view.kind === "quota" ? (
          <Link href="/scans" className="btn btn-primary pressable">
            {limits.openHistory}
          </Link>
        ) : view.kind === "session" ? (
          <Link
            href="/login?reason=session_expired&next=/scan"
            className="btn btn-primary pressable"
          >
            Sign in
          </Link>
        ) : (
          <Button onClick={onRetry}>{limits.tryAgain}</Button>
        )}
        {onChooseAnother ? (
          <Button variant="secondary" onClick={onChooseAnother}>
            {limits.chooseAnother}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
