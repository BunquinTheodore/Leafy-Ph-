import { ScanLine, ShieldCheck, Stethoscope } from "lucide-react";
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

const BENEFITS = [
  { icon: ScanLine, text: "Scan any leaf in seconds" },
  { icon: Stethoscope, text: "Know the cause and the treatment" },
  { icon: ShieldCheck, text: "Keep your scan history private" },
] as const;

/** The page's single h1 (one or two lines) with a short blurb beside the card. */
export function AuthIntro({ eyebrow, title, blurb }: AuthIntroProps) {
  return (
    <div className="auth-intro">
      <p className="eyebrow m-0">{eyebrow}</p>
      <h1 className="display" data-short={title.length <= 10}>
        {title}
      </h1>
      <p className="blurb m-0">{blurb}</p>
      <ul className="auth-benefits">
        {BENEFITS.map(({ icon: Icon, text }) => (
          <li key={text}>
            <span className="auth-benefits__icon" aria-hidden="true">
              <Icon size={20} strokeWidth={1.5} />
            </span>
            {text}
          </li>
        ))}
      </ul>
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
