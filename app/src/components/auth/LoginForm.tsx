"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { sanitizeNext } from "@/lib/http/safe-redirect";
import { enAuth } from "@/lib/i18n/auth.en";
import { useSfx } from "../sfx/SfxProvider";
import { Button } from "../ui/Button";
import { Alert } from "../ui/Display";
import { Input } from "../ui/Input";
import { postAuth } from "./client";
import { useCountdown } from "./countdown";
import { GoogleButton } from "./GoogleButton";
import { buildAuthHref, type AuthNote } from "./messages";
import { RateLimitNote } from "./RateLimitNote";
import { validateEmail, validateLoginPassword } from "./validation";

interface FieldErrors {
  email?: string;
  password?: string;
}

interface LoginFormProps {
  /** Raw `next` query value; sanitized again before it is used. */
  next?: string;
  note: AuthNote | null;
}

const focusFirstInvalid = (form: HTMLFormElement | null) =>
  requestAnimationFrame(() => form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());

export function LoginForm({ next, note }: LoginFormProps) {
  const router = useRouter();
  const sfx = useSfx();
  const form = useRef<HTMLFormElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { remaining, start } = useCountdown();

  const checkEmail = () =>
    setErrors((prev) => ({ ...prev, email: validateEmail(email) ?? undefined }));

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || remaining > 0) return;
    const found: FieldErrors = {
      email: validateEmail(email) ?? undefined,
      password: validateLoginPassword(password) ?? undefined,
    };
    setErrors(found);
    setFormError(null);
    if (found.email || found.password) {
      focusFirstInvalid(form.current);
      return;
    }

    setLoading(true);
    const result = await postAuth("/api/auth/login", { email: email.trim(), password });
    if (result.ok) {
      sfx.play("success");
      router.replace(sanitizeNext(next));
      router.refresh();
      return; // Stay in the loading state until the page changes: no double submit.
    }
    sfx.play("error");
    setLoading(false);
    if (result.code === "rate_limited") start(result.retryAfter ?? 60);
    else setFormError(result.message);
  }

  return (
    <form
      method="post"
      ref={form}
      className="auth-form"
      onSubmit={onSubmit}
      noValidate
      aria-label={`${enAuth.login.title} form`}
    >
      {note ? <Alert tone={note.tone}>{note.text}</Alert> : null}
      <GoogleButton next={next} />
      <p className="auth-divider m-0" aria-hidden="true">
        {enAuth.google.or}
      </p>
      <Input
        label={enAuth.fields.email}
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        autoCapitalize="none"
        spellCheck={false}
        value={email}
        error={errors.email}
        onChange={(event) => {
          setEmail(event.target.value);
          if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
        }}
        onBlur={() => email && checkEmail()}
        required
      />
      <Input
        label={enAuth.fields.password}
        name="password"
        type="password"
        autoComplete="current-password"
        revealable
        value={password}
        error={errors.password}
        onChange={(event) => {
          setPassword(event.target.value);
          if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
        }}
        required
      />
      {remaining > 0 ? <RateLimitNote remaining={remaining} /> : null}
      {formError ? <Alert tone="error">{formError}</Alert> : null}
      <Button type="submit" size="lg" loading={loading} disabled={remaining > 0}>
        {enAuth.login.submit}
      </Button>
      <p className="auth-form__links">
        <Link href={buildAuthHref("/forgot-password", next)}>{enAuth.login.forgot}</Link>
        <span>
          {enAuth.login.noAccount}{" "}
          <Link href={buildAuthHref("/register", next)} className="auth-link">
            {enAuth.login.createAccount}
          </Link>
        </span>
      </p>
    </form>
  );
}
