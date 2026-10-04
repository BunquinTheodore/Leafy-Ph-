"use client";

import { BadgeCheck, MailWarning, ServerCrash } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { enAuth } from "@/lib/i18n/auth.en";
import { Button, LinkButton } from "../ui/Button";
import { Alert } from "../ui/Display";
import { Progress } from "../ui/Progress";
import { postAuth } from "./client";
import { formatCountdown, useCountdown } from "./countdown";
import { verifyEmailToken, type VerifyOutcome } from "./verify";

const copy = enAuth.verify;
const RESEND_COOLDOWN_SECONDS = 60;

type Phase = "working" | VerifyOutcome;

const ICON_PROPS = { size: 40, strokeWidth: 1.5, "aria-hidden": true } as const;

function ResendControls() {
  const [needSignIn, setNeedSignIn] = useState(false);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { remaining, start } = useCountdown();

  async function resend() {
    if (loading || remaining > 0) return;
    setLoading(true);
    setError(null);
    const result = await postAuth("/api/auth/resend-verification", {});
    setLoading(false);
    if (result.ok) {
      setSent(true);
      start(RESEND_COOLDOWN_SECONDS);
    } else if (result.code === "not_authenticated") {
      setNeedSignIn(true);
    } else if (result.code === "already_verified") {
      setSent(false);
      setError(enAuth.errors.already_verified);
    } else if (result.code === "rate_limited") {
      start(result.retryAfter ?? RESEND_COOLDOWN_SECONDS);
    } else {
      setError(result.message);
    }
  }

  if (needSignIn) {
    return (
      <>
        <Alert tone="info">{copy.needSignIn}</Alert>
        <LinkButton href="/login" size="lg">
          {copy.signIn}
        </LinkButton>
      </>
    );
  }
  return (
    <>
      {sent ? <Alert tone="success">{copy.resent}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Button size="lg" onClick={() => void resend()} loading={loading} disabled={remaining > 0}>
        {remaining > 0 ? `${copy.resendIn} ${formatCountdown(remaining)}` : copy.resend}
      </Button>
    </>
  );
}

/** Verifies on mount with a POST (links are never verified by GET) and shows each outcome calmly. */
export function VerifyEmailPanel({ token }: { token: string | null }) {
  const [phase, setPhase] = useState<Phase>(token ? "working" : "expired");

  const run = useCallback(async () => {
    if (!token) return;
    setPhase("working");
    setPhase(await verifyEmailToken(token));
  }, [token]);

  useEffect(() => {
    void run();
  }, [run]);

  if (phase === "working") {
    return (
      <div className="auth-state" role="status" aria-live="polite">
        <h2 className="h3">{copy.working}</h2>
        <Progress label={copy.working} className="w-full" />
      </div>
    );
  }

  if (phase === "verified" || phase === "already") {
    const done = phase === "verified";
    return (
      <div className="auth-state" role="status">
        <BadgeCheck className="auth-state__icon" {...ICON_PROPS} />
        <h2 className="h3">{done ? copy.doneTitle : copy.alreadyTitle}</h2>
        <p>{done ? copy.done : copy.already}</p>
        <LinkButton href="/dashboard" size="lg">
          {copy.continue}
        </LinkButton>
      </div>
    );
  }

  if (phase === "failed") {
    return (
      <div className="auth-state" role="alert">
        <ServerCrash className="auth-state__icon" data-tone="warning" {...ICON_PROPS} />
        <h2 className="h3">{copy.failedTitle}</h2>
        <p>{copy.failed}</p>
        <Button size="lg" onClick={() => void run()}>
          {copy.retry}
        </Button>
      </div>
    );
  }

  return (
    <div className="auth-state" role="status">
      <MailWarning className="auth-state__icon" data-tone="warning" {...ICON_PROPS} />
      <h2 className="h3">{copy.invalidTitle}</h2>
      <p>{copy.invalid}</p>
      <ResendControls />
    </div>
  );
}
