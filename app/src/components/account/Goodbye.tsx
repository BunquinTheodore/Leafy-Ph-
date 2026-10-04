"use client";

import { useEffect, useRef } from "react";
import { member } from "@/lib/i18n/member-en";
import { LogoMark } from "../brand/Logo";

const copy = member.account.goodbye;

/**
 * Shown after the account is deleted. It covers the page (the header would still show a stale
 * user) and moves focus to the message. The home link is a full navigation on purpose.
 */
export function Goodbye() {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  return (
    <div className="goodbye" role="status" data-testid="goodbye">
      <LogoMark height={56} />
      <h1 ref={headingRef} tabIndex={-1} className="display display-sm">
        {copy.title}
      </h1>
      <p className="blurb m-0">{copy.body}</p>
      {/* A full navigation on purpose: the session is gone and the page should start clean. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/" className="btn btn-primary btn-lg pressable">
        {copy.home}
      </a>
    </div>
  );
}
