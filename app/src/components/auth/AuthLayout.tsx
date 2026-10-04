import type { ReactNode } from "react";
import { Card } from "../ui/Display";
import { AuthBackdrop } from "./AuthBackdrop";
import "./auth.css";

/** Full stage with the drifting leaves behind. Pages place an AuthIntro and an AuthCard inside. */
export function AuthStage({ children }: { children: ReactNode }) {
  return (
    <div className="auth-stage">
      <AuthBackdrop />
      <div className="auth-layout">{children}</div>
    </div>
  );
}

interface AuthIntroProps {
  eyebrow: string;
  title: string;
  blurb: string;
}

/** The page's single h1 (one or two lines) with a short blurb beside the card. */
export function AuthIntro({ eyebrow, title, blurb }: AuthIntroProps) {
  return (
    <div className="auth-intro">
      <p className="eyebrow m-0">{eyebrow}</p>
      <h1 className="display">{title}</h1>
      <p className="blurb m-0">{blurb}</p>
    </div>
  );
}

export function AuthCard({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <Card glass panel className="auth-card" aria-label={label}>
      {children}
    </Card>
  );
}
