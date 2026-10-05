"use client";

import { Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { callApi } from "@/lib/api/browser";
import { member } from "@/lib/i18n/member-en";
import { GoogleButton } from "../auth/GoogleButton";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Alert } from "../ui/Display";
import { Input } from "../ui/Input";
import { describeAccountError } from "./messages";
import type { AccountUser } from "./types";

const copy = member.account.danger;
const CONFIRM_WORD = "DELETE";
/** Where a fresh Google sign in returns to: the Danger zone panel. */
const REAUTH_NEXT = "/account#danger";

interface Errors {
  password?: string;
  confirmation?: string;
  form?: string;
  reauth?: boolean;
}

interface DangerPanelProps {
  user: AccountUser;
  /** Called after the API confirmed the deletion (cookies are already cleared). */
  onDeleted: () => void;
}

/**
 * Delete account. Password members enter their password and type DELETE; Google only members
 * type DELETE and may be asked to sign in again (reauth_required). A dialog confirms last.
 */
export function DangerPanel({ user, onDeleted }: DangerPanelProps) {
  const hasPassword = user.auth_methods.includes("password");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  function validate(): Errors {
    const found: Errors = {};
    if (hasPassword && password.length === 0) found.password = copy.passwordRequired;
    if (confirmation !== CONFIRM_WORD) found.confirmation = copy.confirmMismatch;
    return found;
  }

  function review(event: FormEvent) {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length === 0) setConfirming(true);
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    const result = await callApi("/api/me", {
      method: "DELETE",
      json: hasPassword ? { password, confirmation: CONFIRM_WORD } : { confirmation: CONFIRM_WORD },
    });
    setBusy(false);
    setConfirming(false);
    if (result.ok) {
      onDeleted();
      return;
    }
    const problem = describeAccountError(result.error, "password");
    setErrors({
      password: problem.field === "password" ? problem.message : undefined,
      confirmation: problem.field === "confirmation" ? problem.message : undefined,
      form: problem.field === "form" || problem.field === "current" ? problem.message : undefined,
      reauth: problem.field === "reauth",
    });
  }

  return (
    <div className="acct acct--danger">
      <div className="acct__intro">
        <h2 className="h2">{copy.title}</h2>
        <p className="blurb m-0">{copy.blurb}</p>
        <ul className="acct__removes">
          {copy.removes.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
      <form
        method="post"
        className="card card-glass acct__form acct__form--danger"
        onSubmit={review}
        noValidate
      >
        <p className="m-0 text-[var(--text-muted)]">
          {hasPassword ? copy.passwordPrompt : copy.googlePrompt}
        </p>
        {hasPassword ? (
          <Input
            label={copy.password}
            name="password"
            type="password"
            autoComplete="current-password"
            revealable
            value={password}
            error={errors.password}
            onChange={(event) => setPassword(event.target.value)}
          />
        ) : null}
        <Input
          label={copy.confirmation}
          name="confirmation"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          value={confirmation}
          error={errors.confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
        />
        {errors.reauth ? (
          <Alert tone="warning" title={copy.reauthTitle}>
            <p className="m-0">{copy.reauthBody}</p>
            <div className="mt-3">
              <GoogleButton next={REAUTH_NEXT} label={copy.reauthCta} />
            </div>
          </Alert>
        ) : null}
        {errors.form ? <Alert tone="error">{errors.form}</Alert> : null}
        <Button type="submit" variant="danger" className="acct__submit">
          <Trash2 size={18} strokeWidth={1.5} aria-hidden="true" />
          {copy.open}
        </Button>
      </form>

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={copy.dialogTitle}
        actions={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              {copy.cancel}
            </Button>
            <Button variant="danger" loading={busy} onClick={remove}>
              {copy.confirm}
            </Button>
          </>
        }
      >
        <p>{copy.dialogBody}</p>
      </Dialog>
    </div>
  );
}
