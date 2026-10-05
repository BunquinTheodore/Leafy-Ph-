import { en } from "@/lib/i18n/en";
import { LinkButton } from "../ui/Button";
import { HeroScene } from "./HeroScene";

/**
 * Landing hero: one centered composition. The headline spans the container, the intro text and
 * buttons sit under it, and the leaf scene owns its own cell beside them (never behind text).
 * Standalone it is a full stage; `embedded` lives inside the first sideways panel.
 */
export function Hero({ embedded = false }: { embedded?: boolean }) {
  const copy = en.hero;
  return (
    <section
      className={embedded ? "hero hero--embedded" : "hero stage-fill wide-stage"}
      aria-labelledby="hero-title"
    >
      <div className="hero__copy">
        <header className="hero__head">
          <p className="eyebrow m-0">{copy.eyebrow}</p>
          <h1 id="hero-title" className="display-hero">
            {copy.title}
          </h1>
        </header>
        <div className="hero__body">
          <p className="blurb m-0 max-w-none">{copy.support}</p>
          <div className="hero__actions">
            <LinkButton href="/scan" size="lg">
              {copy.primaryCta}
            </LinkButton>
            <LinkButton href="/handbook" variant="secondary" size="lg">
              {copy.secondaryCta}
            </LinkButton>
          </div>
        </div>
      </div>
      <HeroScene />
    </section>
  );
}
