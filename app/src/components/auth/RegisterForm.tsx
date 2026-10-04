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
import { PasswordStrength } from "../ui/PasswordStrength";
import { postAuth } from "./client";
import { useCountdown } from "./countdown";
import { GoogleButton } from "./GoogleButton";
import { buildAuthHref } from "./messages";
import { RateLimitNote } from "./RateLimitNote";
import { splitName, validateEmail, validateName, validateNewPassword } from "./validation";

interface FieldErrors {
  name?: string;
  email?: string;
  password?: string;
}

const copy = enAuth.register;

const focusFirstInvalid = (form: HTMLFormElement | null) =>
  requestAnimationFrame(() => form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());

export function RegisterForm({ next }: { next?: string }) {
  const router = useRouter();
  const sfx = useSfx();
  const form = useRef<HTMLFormElement>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [emailTaken, setEmailTaken] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { remaining, start } = useCountdown();

  const setError = (field: keyof FieldErrors, message: string | null) =>
    setErrors((prev) => ({ ...prev, [field]: message ?? undefined }));

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || remaining > 0) return;
    const found: FieldErrors = {
      name: validateName(name) ?? undefined,
      email: validateEmail(email) ?? undefined,
      password: validateNewPassword(password, email) ?? undefined,
    };
    setErrors(found);
    setFormError(null);
    setEmailTaken(false);
    if (found.name || found.email || found.password) {
      focusFirstInvalid(form.current);
      return;
    }

    setLoading(true);
    const result = await postAuth("/api/auth/register", {
      email: email.trim(),
      password,
      ...splitName(name),
    });
    if (result.ok) {
      sfx.play("success");
      router.replace(sanitizeNext(next));
      router.refresh();
      return;
    }
    sfx.play("error");
    setLoading(false);

    if (result.code === "email_taken") {
      setEmailTaken(true);
      setError("email", copy.taken);
      focusFirstInvalid(form.current);
    } else if (result.code === "rate_limited") {
      start(result.retryAfter ?? 60);
    } else if (result.code === "validation_error" && result.fields.includes("password")) {
      setError("password", enAuth.fields.passwordRejected);
      focusFirstInvalid(form.current);
    } else {
      setFormError(result.message);
    }
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
      <GoogleButton next={next} />
      <p className="auth-divider m-0" aria-hidden="true">
        {enAuth.google.or}
      </p>
      <Input
        label={enAuth.fields.name}
        name="name"
        autoComplete="name"
        value={name}
        error={errors.name}
        onChange={(event) => {
          setName(event.target.value);
          if (errors.name) setError("name", null);
        }}
        onBlur={() => name && setError("name", validateName(name))}
        required
      />
      <div>
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
            setEmailTaken(false);
            if (errors.email) setError("email", null);
          }}
          onBlur={() => email && setError("email", validateEmail(email))}
          required
        />
        {emailTaken ? (
          <p className="auth-hint-links">
            <Link href={buildAuthHref("/login", next)} className="auth-link">
              {copy.takenSignIn}
            </Link>
            <Link href={buildAuthHref("/forgot-password", next)} className="auth-link">
              {copy.takenReset}
            </Link>
          </p>
        ) : null}
      </div>
      <div>
        <Input
          label={enAuth.fields.password}
          name="password"
          type="password"
          autoComplete="new-password"
          revealable
          value={password}
          error={errors.password}
          hint={password ? undefined : enAuth.fields.passwordHint}
          onChange={(event) => {
            setPassword(event.target.value);
            if (errors.password) setError("password", null);
          }}
          onBlur={() => password && setError("password", validateNewPassword(password, email))}
          required
        />
        {password ? <PasswordStrength password={password} email={email} /> : null}
      </div>
      {remaining > 0 ? <RateLimitNote remaining={remaining} /> : null}
      {formError ? <Alert tone="error">{formError}</Alert> : null}
      <Button type="submit" size="lg" loading={loading} disabled={remaining > 0}>
        {copy.submit}
      </Button>
      <p className="auth-legal">
        {copy.terms}{" "}
        <Link href="/terms" target="_blank" rel="noopener">
          {copy.termsLink}
        </Link>{" "}
        {copy.and}{" "}
        <Link href="/privacy" target="_blank" rel="noopener">
          {copy.privacyLink}
        </Link>
        . <span className="sr-only">Both open in a new tab.</span>
      </p>
      <p className="auth-form__links">
        <span>
          {copy.haveAccount}{" "}
          <Link href={buildAuthHref("/login", next)} className="auth-link">
            {copy.signIn}
          </Link>
        </span>
      </p>
    </form>
  );
}
