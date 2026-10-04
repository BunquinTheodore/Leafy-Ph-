"use client";

import { LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { callApi } from "@/lib/api/browser";
import { member } from "@/lib/i18n/member-en";
import { initialsFor } from "./nav";

export interface MenuUser {
  firstName: string;
  lastName: string;
  email: string;
}

const copy = member.userMenu;

/** Account menu: who you are, a link to Account and Sign out. Escape and outside click close it. */
export function UserMenu({ user }: { user: MenuUser }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function signOut() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const result = await callApi("/api/auth/logout", { method: "POST" });
    if (result.ok) {
      window.location.assign("/");
      return;
    }
    setBusy(false);
    setFailed(true);
  }

  const initials = initialsFor(user.firstName, user.lastName, user.email);
  const name = `${user.firstName} ${user.lastName}`.trim() || user.email;

  return (
    <div
      ref={rootRef}
      className="user-menu"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="user-menu__trigger pressable"
        aria-label={`${initials}: ${copy.open}`}
        aria-expanded={open}
        aria-controls={menuId}
        data-sfx="toggle"
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">{initials}</span>
      </button>
      {open ? (
        <div
          id={menuId}
          className="user-menu__panel card card-glass"
          role="group"
          aria-label={name}
        >
          <p className="user-menu__who m-0">
            <span className="user-menu__label">{copy.signedInAs}</span>
            <strong className="title-line block">{name}</strong>
            <span className="title-line block text-[var(--text-muted)]">{user.email}</span>
          </p>
          <Link
            href="/account"
            className="user-menu__item pressable"
            onClick={() => setOpen(false)}
          >
            <UserRound size={18} strokeWidth={1.5} aria-hidden="true" />
            {copy.account}
          </Link>
          <button
            type="button"
            className="user-menu__item pressable"
            onClick={signOut}
            disabled={busy}
            aria-busy={busy || undefined}
          >
            <LogOut size={18} strokeWidth={1.5} aria-hidden="true" />
            {busy ? copy.signingOut : copy.signOut}
          </button>
          {failed ? (
            <p role="alert" className="field__message m-0" data-tone="error">
              {copy.signOutFailed}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
