"use client";

import { KeyRound, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { callApi } from "@/lib/api/browser";
import type { AuthMethod } from "@/lib/api/types";
import { member } from "@/lib/i18n/member-en";
import { Button } from "../ui/Button";
import { Alert, Badge } from "../ui/Display";
import { Input } from "../ui/Input";
import { useToast } from "../ui/Toast";
import { describeAccountError } from "./messages";
import type { AccountUser } from "./types";

const copy = member.account.profile;

function MethodList({ methods }: { methods: readonly AuthMethod[] }) {
  if (methods.length === 0)
    return <p className="m-0 text-[var(--text-muted)]">{copy.methodsEmpty}</p>;
  return (
    <ul className="acct__methods" aria-label={copy.methodsTitle}>
      {methods.map((method) => (
        <li key={method}>
          <Badge tone="info">
            {method === "google" ? (
              <ShieldCheck size={14} strokeWidth={1.5} aria-hidden="true" />
            ) : (
              <KeyRound size={14} strokeWidth={1.5} aria-hidden="true" />
            )}
            {copy.methods[method]}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

/** Profile: first and last name, the email (read only) and how the member signs in. */
export function ProfilePanel({ user }: { user: AccountUser }) {
  const router = useRouter();
  const toast = useToast();
  const [firstName, setFirstName] = useState(user.first_name);
  const [lastName, setLastName] = useState(user.last_name);
  const [busy, setBusy] = useState(false);
  const [firstError, setFirstError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);

  const dirty = firstName.trim() !== user.first_name || lastName.trim() !== user.last_name;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setFormError(null);
    if (firstName.trim().length === 0) {
      setFirstError(copy.firstNameRequired);
      return;
    }
    setFirstError(undefined);
    setBusy(true);
    const result = await callApi("/api/me", {
      method: "PATCH",
      json: { first_name: firstName.trim(), last_name: lastName.trim() },
    });
    setBusy(false);
    if (result.ok) {
      toast({ message: copy.saved, tone: "success" });
      router.refresh();
      return;
    }
    const problem = describeAccountError(result.error, "firstName");
    if (problem.field === "firstName") setFirstError(problem.message);
    else setFormError(problem.message);
  }

  return (
    <div className="acct">
      <div className="acct__intro">
        <h2 className="h2">{copy.title}</h2>
        <p className="blurb m-0">{copy.blurb}</p>
        <div className="acct__methods-block">
          <h3 className="acct__subtitle">{copy.methodsTitle}</h3>
          <MethodList methods={user.auth_methods} />
        </div>
      </div>
      <form
        method="post"
        className="card card-glass card-vein acct__form"
        onSubmit={submit}
        noValidate
      >
        <div className="acct__row">
          <Input
            label={copy.firstName}
            name="first_name"
            autoComplete="given-name"
            maxLength={100}
            value={firstName}
            error={firstError}
            onChange={(event) => setFirstName(event.target.value)}
          />
          <Input
            label={copy.lastName}
            name="last_name"
            autoComplete="family-name"
            maxLength={100}
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
          />
          <Input
            label={copy.email}
            name="email"
            type="email"
            value={user.email}
            readOnly
            aria-readonly="true"
            hint={copy.emailHint}
          />
        </div>
        {formError ? <Alert tone="error">{formError}</Alert> : null}
        <Button
          type="submit"
          magnetic={false}
          loading={busy}
          disabled={!dirty}
          className="acct__submit"
        >
          {copy.save}
        </Button>
      </form>
    </div>
  );
}
