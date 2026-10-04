import {
  ArrowRight,
  BookOpenCheck,
  Camera,
  ChevronDown,
  EyeOff,
  Lock,
  ScanSearch,
  Sprout,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { plantPhotoSrc } from "@/lib/handbook/photos";
import type { PlantSummary } from "@/lib/handbook/types";
import { Card, EmptyState } from "../ui/Display";
import { LinkButton } from "../ui/Button";
import { SpotlightSurface } from "../interaction/Surfaces";
import { AccentScene } from "./AccentScene";
import { landingCopy, type FaqItem } from "./copy";

const STEP_ICONS: readonly LucideIcon[] = [Camera, ScanSearch, BookOpenCheck];
const REASON_ICONS: readonly LucideIcon[] = [BookOpenCheck, Sprout, Lock, EyeOff];

function Head({ eyebrow, title, id }: { eyebrow: string; title: string; id: string }) {
  return (
    <header className="lp-head">
      <p className="eyebrow m-0">{eyebrow}</p>
      <h2 id={id} className="h2">
        {title}
      </h2>
    </header>
  );
}

export function HowItWorks() {
  const copy = landingCopy.how;
  return (
    <section className="lp-body" aria-labelledby="how-title">
      <AccentScene variant="beam" />
      <div className="lp-split">
        <div className="grid gap-6">
          <Head eyebrow={copy.eyebrow} title={copy.title} id="how-title" />
          <ol className="steps">
            {copy.steps.map((step, index) => {
              const Icon = STEP_ICONS[index] ?? Camera;
              return (
                <li key={step.title}>
                  <Card glass tilt className="step">
                    <span className="step__icon" aria-hidden="true">
                      <Icon size={24} strokeWidth={1.5} />
                      <span className="step__num">{index + 1}</span>
                    </span>
                    <div>
                      <h3>{step.title}</h3>
                      <p>{step.body}</p>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}

function PlantThumb({ plant }: { plant: PlantSummary }) {
  const src = plantPhotoSrc(plant.slug);
  return (
    <li>
      <Link href={`/handbook/${plant.slug}`} className="thumb pressable">
        <span className="duotone">
          {src ? (
            <Image
              src={src}
              alt={plant.image_alt ?? `${plant.name} plant`}
              fill
              sizes="(min-width: 1100px) 12vw, (min-width: 700px) 18vw, 22vw"
            />
          ) : (
            <span className="duotone__empty" aria-hidden="true">
              <Sprout size={24} strokeWidth={1.5} />
            </span>
          )}
        </span>
        <span className="thumb__name title-line">{plant.name}</span>
      </Link>
    </li>
  );
}

export function PlantsWeCover({
  plants,
  diseaseCount,
}: {
  plants: PlantSummary[] | null;
  diseaseCount: number;
}) {
  const copy = landingCopy.plants;
  const title =
    plants && plants.length > 0
      ? `${plants.length} plants and ${diseaseCount} diseases in plain words`
      : "A handbook of common plant diseases";
  return (
    <section className="lp-body" aria-labelledby="plants-title">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Head eyebrow={copy.eyebrow} title={title} id="plants-title" />
        <LinkButton href="/handbook" variant="secondary">
          {copy.openHandbook}
          <ArrowRight size={18} strokeWidth={1.5} aria-hidden="true" />
        </LinkButton>
      </div>
      {plants && plants.length > 0 ? (
        <ul className="lp-plants">
          {plants.map((plant) => (
            <PlantThumb key={plant.slug} plant={plant} />
          ))}
        </ul>
      ) : (
        <EmptyState
          title={copy.unavailableTitle}
          action={
            <LinkButton href="/handbook" variant="secondary">
              {copy.openHandbook}
            </LinkButton>
          }
        >
          {copy.unavailableBody}
        </EmptyState>
      )}
    </section>
  );
}

export function WhyLeafy() {
  const copy = landingCopy.why;
  return (
    <section className="lp-body" aria-labelledby="why-title">
      <AccentScene variant="leaves" />
      <div className="lp-split">
        <Head eyebrow={copy.eyebrow} title={copy.title} id="why-title" />
        <ul className="reasons">
          {copy.reasons.map((reason, index) => {
            const Icon = REASON_ICONS[index] ?? Sprout;
            return (
              <li key={reason.title}>
                <Card glass tilt className="reason">
                  <Icon className="reason__icon" size={26} strokeWidth={1.5} aria-hidden="true" />
                  <h3>{reason.title}</h3>
                  <p>{reason.body}</p>
                </Card>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

export function Faq({ items }: { items: FaqItem[] }) {
  const copy = landingCopy.faq;
  return (
    <section className="lp-body" aria-labelledby="faq-title">
      <Head eyebrow={copy.eyebrow} title={copy.title} id="faq-title" />
      <SpotlightSurface className="faq">
        {items.map((item) => (
          <details key={item.question} name="faq">
            <summary>
              {item.question}
              <ChevronDown size={20} strokeWidth={1.5} aria-hidden="true" />
            </summary>
            <p>{item.answer}</p>
          </details>
        ))}
      </SpotlightSurface>
    </section>
  );
}

export function FinalCta(): ReactNode {
  const copy = landingCopy.start;
  return (
    <section className="lp-cta" aria-labelledby="start-title">
      <AccentScene variant="drift" />
      <h2 id="start-title" className="display">
        {copy.title}
      </h2>
      <div className="lp-cta__actions">
        <LinkButton href="/scan" size="lg">
          {copy.primary}
        </LinkButton>
        <LinkButton href="/handbook" variant="secondary" size="lg">
          {copy.secondary}
        </LinkButton>
      </div>
    </section>
  );
}
