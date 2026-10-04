"use client";

import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { enAuth } from "@/lib/i18n/auth.en";
import { Button } from "../ui/Button";
import { Alert } from "../ui/Display";
import { Input } from "../ui/Input";
import { postAuth } from "./client";
import { formatCountdown, useCountdown } from "./countdown";
import { buildAuthHref } from "./messages";
import { RateLimitNote } from "./RateLimitNote";
import { validateEmail } from "./validation";

const copy = enAuth.forgot;
const RESEND_COOLDOWN_SECONDS = 60;

/** Always answers the same way, so nobody can learn which emails have accounts. */
export function ForgotPasswordForm({ next }: { next?: string }) {
  const form = useRef<HTMLFormElement>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const limit = useCountdown();
  const cooldown = useCountdown();

  async function send(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (loading || limit.remaining > 0 || cooldown.remaining > 0) return;
    const problem = validateEmail(email);
    setError(problem ?? undefined);
    setFormError(null);
    if (problem) {
      requestAnimationFrame(() =>
        form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      );
      return;
    }

    setLoading(true);
    const result = await postAuth("/api/auth/forgot-password", { email: email.trim() });
    setLoading(false);
    if (result.ok) {
      setSent(true);
      cooldown.start(RESEND_COOLDOWN_SECONDS);
    } else if (result.code === "rate_limited") {
      limit.start(result.retryAfter ?? RESEND_COOLDOWN_SECONDS);
    } else {
      setFormError(result.message);
    }
  }

  if (sent) {
    return (
      <div className="auth-state" role="status">
        <MailCheck className="auth-state__icon" size={40} strokeWidth={1.5} aria-hidden="true" />
        <h2 className="h3">{copy.sentTitle}</h2>
        <p>{copy.sent}</p>
        {limit.remaining > 0 ? <RateLimitNote remaining={limit.remaining} /> : null}
        <Button
          variant="secondary"
          onClick={() => void send()}
          loading={loading}
          disabled={cooldown.remaining > 0 || limit.remaining > 0}
        >
          {cooldown.remaining > 0
            ? `${copy.resendIn} ${formatCountdown(cooldown.remaining)}`
            : copy.resend}
        </Button>
        <Link href={buildAuthHref("/login", next)} className="auth-link">
          {copy.back}
        </Link>
      </div>
    );
  }

  return (
    <form
      method="post"
      ref={form}
      className="auth-form"
      onSubmit={send}
      noValidate
      aria-label={`${copy.title} form`}
    >
      <Input
        label={enAuth.fields.email}
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        autoCapitalize="none"
        spellCheck={false}
        value={email}
        error={error}
        onChange={(event) => {
          setEmail(event.target.value);
          if (error) setError(undefined);
        }}
        onBlur={() => email && setError(validateEmail(email) ?? undefined)}
        required
      />
      {limit.remaining > 0 ? <RateLimitNote remaining={limit.remaining} /> : null}
      {formError ? <Alert tone="error">{formError}</Alert> : null}
      <Button type="submit" size="lg" loading={loading} disabled={limit.remaining > 0}>
        {copy.submit}
      </Button>
      <p className="auth-form__links">
        <Link href={buildAuthHref("/login", next)}>{copy.back}</Link>
      </p>
    </form>
  );
}
