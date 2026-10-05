"use client";

import { TimerReset } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { scanCopy } from "@/lib/i18n/scan-en";
import type { ScanErrorView } from "@/lib/scans/errors";
import { cooldownDeadline, secondsRemaining } from "@/lib/member/cooldown";
import { Button } from "../ui/Button";
import { Alert } from "../ui/Display";
import { useNow } from "./hooks";

const limits = scanCopy.limits;

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
