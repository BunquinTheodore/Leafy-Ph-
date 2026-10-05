"use client";

import { useEffect, useRef, useState } from "react";
import {
  completeRedirectSignIn,
  preloadFirebase,
  signInWithGoogle,
  type GoogleSignInResult,
} from "@/lib/firebase/client";
import { isGoogleSignInAvailable } from "@/lib/firebase/config";
import { sanitizeNext } from "@/lib/http/safe-redirect";
import { enAuth } from "@/lib/i18n/auth.en";
import { Alert } from "../ui/Display";
import { postAuth } from "./client";
import { messageForCode } from "./messages";

/** Google's four color "G" (brand artwork, drawn as inline SVG so it needs no request). */
function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

type Phase = "idle" | "opening" | "finishing";
interface Problem {
  tone: "info" | "warning" | "error";
  text: string;
}

const SOFT_FAILURES: Record<"cancelled" | "network" | "failed" | "disabled", Problem> = {
  cancelled: { tone: "info", text: messageForCode("google_cancelled") },
  network: { tone: "error", text: messageForCode("google_network") },
  failed: { tone: "error", text: messageForCode("google_auth_failed") },
  disabled: { tone: "warning", text: messageForCode("google_unavailable") },
};

const problemFromApi = (code: string, fallback: string): Problem => ({
  tone: "error",
  text: code.startsWith("google_") || code === "rate_limited" ? messageForCode(code) : fallback,
});

/**
 * "Continue with Google": signs in with Firebase in a popup (a redirect when popups are blocked),
 * then hands the ID token to our own route, which sets the session cookies. The Firebase SDK is
 * fetched only after the person shows intent, so it is not part of the page's first load.
 */
export function GoogleButton({ next, label: idleLabel }: { next?: string; label?: string }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [problem, setProblem] = useState<Problem | null>(null);
  const busy = phase !== "idle";
  const available = isGoogleSignInAvailable();
  const working = useRef(false);
  const resumed = useRef(false);

  async function exchange(result: GoogleSignInResult) {
    if (result.status === "redirecting") return; // the browser is leaving for Google
    if (result.status !== "ok") {
      setProblem(SOFT_FAILURES[result.status]);
      setPhase("idle");
      return;
    }
    setPhase("finishing");
    const session = await postAuth("/api/auth/google", { idToken: result.idToken });
    if (session.ok) {
      // A full load so the one time welcome notice cookie is read and the session is fresh.
      window.location.assign(sanitizeNext(next));
      return; // stay busy until the page changes: no double submit
    }
    setProblem(problemFromApi(session.code, session.message));
    setPhase("idle");
  }

  async function start() {
    if (working.current) return;
    working.current = true;
    setProblem(null);
    setPhase("opening");
    try {
      await exchange(await signInWithGoogle());
    } finally {
      working.current = false;
    }
  }

  // Back from a redirect sign in (popup blocked earlier): finish it without another click.
  useEffect(() => {
    if (!available || resumed.current) return;
    resumed.current = true;
    void completeRedirectSignIn().then((result) => {
      if (!result || working.current) return undefined;
      working.current = true;
      setPhase("opening");
      return exchange(result).finally(() => {
        working.current = false;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per page load
  }, []);

  // Coming back with the browser's back button restores the page from cache with busy still set.
  useEffect(() => {
    const reset = (event: PageTransitionEvent) => {
      if (event.persisted) setPhase("idle");
    };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  const label =
    phase === "opening"
      ? enAuth.google.opening
      : phase === "finishing"
        ? enAuth.google.finishing
        : (idleLabel ?? enAuth.google.label);

  return (
    <>
      <button
        type="button"
        className="google-btn pressable"
        disabled={!available}
        aria-busy={busy || undefined}
        aria-disabled={busy || undefined}
        aria-describedby={available ? undefined : "google-unavailable"}
        onPointerEnter={preloadFirebase}
        onFocus={preloadFirebase}
        onTouchStart={preloadFirebase}
        onClick={() => {
          if (!busy) void start();
        }}
      >
        <GoogleMark />
        <span>{label}</span>
      </button>
      {available ? null : (
        <p id="google-unavailable" className="m-0 auth-hint">
          {enAuth.google.unavailableHint}
        </p>
      )}
      {problem ? <Alert tone={problem.tone}>{problem.text}</Alert> : null}
    </>
  );
}
