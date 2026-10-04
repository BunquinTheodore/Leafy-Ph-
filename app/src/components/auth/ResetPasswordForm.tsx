"use client";

import { CheckCircle2, TimerOff } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { enAuth } from "@/lib/i18n/auth.en";
import { Button, LinkButton } from "../ui/Button";
import { Alert } from "../ui/Display";
import { Input } from "../ui/Input";
import { PasswordStrength } from "../ui/PasswordStrength";
import { postAuth } from "./client";
import { useCountdown } from "./countdown";
import { RateLimitNote } from "./RateLimitNote";
import { validateNewPassword } from "./validation";

const copy = enAuth.reset;

type Phase = "form" | "done" | "invalid";

/** Removes the secret from the address bar and history right away (the token stays in memory). */
function scrubTokenFromUrl() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("token")) return;
  url.searchParams.delete("token");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

export function ResetPasswordForm({ token }: { token: string | null }) {
  const form = useRef<HTMLFormElement>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<Phase>(token ? "form" : "invalid");
  const { remaining, start } = useCountdown();

  useEffect(scrubTokenFromUrl, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || remaining > 0 || !token) return;
    const problem = validateNewPassword(password, "");
    setError(problem ?? undefined);
    setFormError(null);
    if (problem) {
      requestAnimationFrame(() =>
        form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      );
      return;
    }

    setLoading(true);
    const result = await postAuth("/api/auth/reset-password", { token, new_password: password });
    setLoading(false);
    if (result.ok) setPhase("done");
    else if (result.code === "token_invalid_or_expired") setPhase("invalid");
    else if (result.code === "rate_limited") start(result.retryAfter ?? 60);
    else if (result.code === "validation_error" && result.fields.includes("new_password"))
      setError(enAuth.fields.passwordRejected);
    else setFormError(result.message);
  }

  if (phase === "done") {
    return (
      <div className="auth-state" role="status">
        <CheckCircle2 className="auth-state__icon" size={40} strokeWidth={1.5} aria-hidden="true" />
        <h2 className="h3">{copy.doneTitle}</h2>
        <p>{copy.done}</p>
        <LinkButton href="/login" size="lg">
          {copy.signIn}
        </LinkButton>
      </div>
    );
  }

  if (phase === "invalid") {
    return (
      <div className="auth-state" role="status">
        <TimerOff
          className="auth-state__icon"
          data-tone="warning"
          size={40}
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <h2 className="h3">{copy.invalidTitle}</h2>
        <p>{copy.invalid}</p>
        <LinkButton href="/forgot-password" size="lg">
          {copy.newLink}
        </LinkButton>
      </div>
    );
  }

  return (
    <form
      method="post"
      ref={form}
      className="auth-form"
      onSubmit={onSubmit}
      noValidate
      aria-label={`${copy.title} form`}
    >
      <div>
        <Input
          label={enAuth.fields.newPassword}
          name="new-password"
          type="password"
          autoComplete="new-password"
          revealable
          value={password}
          error={error}
          hint={password ? undefined : enAuth.fields.passwordHint}
          onChange={(event) => {
            setPassword(event.target.value);
            if (error) setError(undefined);
          }}
          required
        />
        {password ? <PasswordStrength password={password} /> : null}
      </div>
      {remaining > 0 ? <RateLimitNote remaining={remaining} /> : null}
      {formError ? <Alert tone="error">{formError}</Alert> : null}
      <Button type="submit" size="lg" loading={loading} disabled={remaining > 0}>
        {copy.submit}
      </Button>
    </form>
  );
}
