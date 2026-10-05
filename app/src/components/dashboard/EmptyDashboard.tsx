import { Camera, ScanLine } from "lucide-react";
import { member } from "@/lib/i18n/member-en";
import { LinkButton } from "../ui/Button";

const copy = member.dashboard;

/** Guided first scan for an account with no scans yet. One next action. */
export function EmptyDashboard() {
  return (
    <section className="dash-empty card card-glass card-vein" aria-labelledby="dash-empty-title">
      <Camera className="dash-empty__icon" size={44} strokeWidth={1.5} aria-hidden="true" />
      <h2 id="dash-empty-title" className="h2 dash-empty__title">
        {copy.emptyTitle}
      </h2>
      <p className="blurb m-0">{copy.emptyBody}</p>
      <ol className="dash-empty__steps">
        {copy.emptySteps.map((step, index) => (
          <li key={step}>
            <span className="dash-empty__num stat" aria-hidden="true">
              {index + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
      <LinkButton href="/scan" size="lg">
        <ScanLine size={20} strokeWidth={1.5} aria-hidden="true" />
        {copy.scanCta}
      </LinkButton>
    </section>
  );
}
