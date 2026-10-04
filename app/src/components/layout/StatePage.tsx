import type { ReactNode } from "react";
import { LogoMark } from "../brand/Logo";
import "./state-page.css";

interface StatePageProps {
  eyebrow: string;
  title: string;
  children: ReactNode;
  /** Buttons or links: always at least one way out. */
  actions: ReactNode;
  /** Small print under the actions, such as an error reference. */
  note?: ReactNode;
}

/** Calm full stage used by 404 and error pages: what happened, then a way out. */
export function StatePage({ eyebrow, title, children, actions, note }: StatePageProps) {
  return (
    <section className="state-page stage-fill" aria-labelledby="state-title">
      <div className="state-page__mark" aria-hidden="true">
        <LogoMark height={280} />
      </div>
      <div className="state-page__content">
        <p className="eyebrow m-0">{eyebrow}</p>
        <h1 id="state-title" className="display">
          {title}
        </h1>
        <p className="blurb m-0">{children}</p>
        <div className="state-page__actions">{actions}</div>
        {note ? <p className="state-page__note m-0">{note}</p> : null}
      </div>
    </section>
  );
}
