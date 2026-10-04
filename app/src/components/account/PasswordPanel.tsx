"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { callApi } from "@/lib/api/browser";
import { member } from "@/lib/i18n/member-en";
import { Button } from "../ui/Button";
import { Alert } from "../ui/Display";
import { Input } from "../ui/Input";
import { MIN_PASSWORD_LENGTH } from "../ui/password-score";
import { PasswordStrength } from "../ui/PasswordStrength";
import { useToast } from "../ui/Toast";
import { describeAccountError } from "./messages";
import type { AccountUser } from "./types";

const copy = member.account.password;

interface Errors {
  current?: string;
  next?: string;
  form?: string;
}

/**
 * Change the password with the current one, or set a first password for a Google only member.
 * After setting a first password the page refreshes so the panel becomes "Change password".
 */
export function PasswordPanel({ user }: { user: AccountUser }) {
  const router = useRouter();
  const toast = useToast();
  const hasPassword = user.auth_methods.includes("password");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  function validate(): Errors {
    const found: Errors = {};
    if (hasPassword && current.length === 0) found.current = copy.currentRequired;
    if (next.length === 0) found.next = copy.newRequired;
    else if (next.length < MIN_PASSWORD_LENGTH) {
      found.next = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    return found;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    const result = await callApi("/api/me/password", {
      method: "POST",
      json: hasPassword
        ? { current_password: current, new_password: next }
        : { new_password: next },
    });
    setBusy(false);

    if (result.ok) {
      setCurrent("");
      setNext("");
      toast({ message: hasPassword ? copy.changed : copy.wasSet, tone: "success" });
      if (!hasPassword) router.refresh();
      return;
    }
    const problem = describeAccountError(result.error, "current");
    setErrors({
      current: problem.field === "current" ? problem.message : undefined,
      next: problem.field === "new" ? problem.message : undefined,
      form: problem.field === "form" || problem.field === "reauth" ? problem.message : undefined,
    });
  }

  return (
    <div className="acct">
      <div className="acct__intro">
        <h2 className="h2">{hasPassword ? copy.title : copy.setTitle}</h2>
        <p className="blurb m-0">{hasPassword ? copy.changeBlurb : copy.setBlurb}</p>
      </div>
      <form
        method="post"
        className="card card-glass card-vein acct__form"
        onSubmit={submit}
        noValidate
      >
        {/* Lets password managers file the new password under the right account. */}
        <input
          type="text"
          name="username"
          autoComplete="username"
          value={user.email}
          readOnly
          hidden
        />
        {hasPassword ? (
          <Input
            label={copy.current}
            name="current_password"
            type="password"
            autoComplete="current-password"
            revealable
            value={current}
            error={errors.current}
            onChange={(event) => setCurrent(event.target.value)}
          />
        ) : null}
        <div>
          <Input
            label={copy.next}
            name="new_password"
            type="password"
            autoComplete="new-password"
            revealable
            value={next}
            error={errors.next}
            onChange={(event) => setNext(event.target.value)}
          />
          <PasswordStrength password={next} email={user.email} />
        </div>
        {errors.form ? <Alert tone="error">{errors.form}</Alert> : null}
        <Button type="submit" magnetic={false} loading={busy} className="acct__submit">
          {hasPassword ? copy.change : copy.set}
        </Button>
      </form>
    </div>
  );
}
