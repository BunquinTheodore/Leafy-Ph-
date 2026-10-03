import { en } from "@/lib/i18n/en";
import { LinkButton } from "../ui/Button";
import { HeroScene } from "./HeroScene";

/** Landing hero: one viewport stage with the leaf scene behind real HTML content. */
export function Hero() {
  const copy = en.hero;
  return (
    <section className="hero stage-fill" aria-labelledby="hero-title">
      <HeroScene />
      <div className="hero__content">
        <p className="eyebrow m-0">{copy.eyebrow}</p>
        <h1 id="hero-title" className="display-hero">
          {copy.title}
        </h1>
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
    </section>
  );
}
