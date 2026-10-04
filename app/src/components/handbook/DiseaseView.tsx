"use client";

import { ImageOff } from "lucide-react";
import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { causeSentence, handbookCopy } from "@/lib/handbook/copy";
import type { ViewportSize } from "@/lib/handbook/device";
import { severityBrief, severityLevel } from "@/lib/handbook/severity";
import type { DiseaseDetail } from "@/lib/handbook/types";
import { SlidePanels, type Panel } from "../slide-panels/SlidePanels";
import { LinkButton } from "../ui/Button";
import { EmptyState, SEVERITY_LABELS } from "../ui/Display";
import { LeafAccent } from "./LeafAccent";
import { MagnifierImage } from "./MagnifierImage";
import { SeverityBadge } from "./SeverityBadge";
import { TermText } from "./TermText";
import { useViewportSize } from "./useViewportSize";

const copy = handbookCopy.disease;
/** Panel budget: at most six list items; the rest moves to another panel. */
const ITEMS_DESKTOP = 6;
const ITEMS_PHONE = 4;
const MAX_SPECIES = 8;
const MAX_SPECIES_PHONE = 4;

export function chunkItems<T>(items: readonly T[], size: number): T[][] {
  const pages: T[][] = [];
  for (let start = 0; start < items.length; start += size)
    pages.push(items.slice(start, start + size));
  return pages;
}

const captionFor = (disease: DiseaseDetail) => `${disease.plant.name}, ${disease.display_name}`;

function Aside({ disease, caption }: { disease: DiseaseDetail; caption: string }) {
  return (
    <div className="dp__aside">
      <LeafAccent tone={severityLevel(disease.severity) ?? "brand"} />
      <p className="dp__caption">{caption}</p>
    </div>
  );
}

function Shell({
  title,
  children,
  aside,
}: {
  title: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className={aside ? "dp" : "dp dp--wide"}>
      <div className="dp__main">
        <h2 className="h2">{title}</h2>
        {children}
      </div>
      {aside}
    </div>
  );
}

function Facts({ disease }: { disease: DiseaseDetail }) {
  const rows: Array<[string, ReactNode]> = [
    [
      "Plant",
      <Link key="plant" href={`/handbook/${disease.plant.slug}`} className="vein-link">
        {disease.plant.name}
      </Link>,
    ],
  ];
  if (disease.pathogen_type)
    rows.push([
      "Cause type",
      <span key="type" className="capitalize">
        {disease.pathogen_type}
      </span>,
    ]);
  if (disease.pathogen_name) rows.push(["Pathogen", <em key="name">{disease.pathogen_name}</em>]);
  if (disease.severity)
    rows.push([
      "Severity",
      <div key="sev" className="grid gap-2">
        <span className="inline-flex flex-wrap items-center gap-2">
          <SeverityBadge severity={disease.severity} withPrefix={false} />
          {severityBrief(disease.severity) ? <span>{disease.severity}</span> : null}
        </span>
        {severityBrief(disease.severity) ? null : (
          <span className="facts__detail">{disease.severity}</span>
        )}
      </div>,
    ]);
  return (
    <dl className="facts">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function List({ items }: { items: string[] }) {
  const seen = new Set<string>();
  return (
    <ol className="plist">
      {items.map((item, index) => (
        <li key={index}>
          <TermText text={item} seen={seen} />
        </li>
      ))}
    </ol>
  );
}

interface ListSpec {
  id: string;
  title: string;
  items: string[];
  size: number;
  disease: DiseaseDetail;
  note?: string;
}

function listPanels({ id, title, items, size, disease, note }: ListSpec): Panel[] {
  const pages = chunkItems(items, size);
  return pages.map((page, index) => {
    const many = pages.length > 1;
    return {
      id: index === 0 ? id : `${id}-${index + 1}`,
      title: many ? `${title} ${index + 1}` : title,
      content: (
        <Shell
          title={many ? `${title} ${index + 1} of ${pages.length}` : title}
          aside={<Aside disease={disease} caption={captionFor(disease)} />}
        >
          <List items={page} />
          {note ? <p className="note">{note}</p> : null}
        </Shell>
      ),
    };
  });
}

function CausesPanel({ disease, phone }: { disease: DiseaseDetail; phone: boolean }) {
  const seen = new Set<string>();
  const species = disease.affected_species.slice(0, phone ? MAX_SPECIES_PHONE : MAX_SPECIES);
  const sentence = causeSentence(
    disease.name,
    disease.plant.name,
    disease.pathogen_type,
    disease.pathogen_name,
  );
  return (
    <Shell title="What causes it" aside={<Aside disease={disease} caption={captionFor(disease)} />}>
      <div className="prose">
        <p>
          <TermText text={sentence} seen={seen} />
        </p>
        {disease.cause ? (
          <p>
            Recorded cause: <TermText text={disease.cause} seen={seen} />
          </p>
        ) : null}
      </div>
      {species.length > 0 ? (
        <div>
          <p className="eyebrow m-0 mb-2">Also affects</p>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {species.map((name) => (
              <li key={name} className="chip chip--plain">
                {name}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Shell>
  );
}

function ImagesPanel({ disease }: { disease: DiseaseDetail }) {
  if (disease.images.length === 0) {
    return (
      <Shell title="Images">
        <EmptyState
          icon={ImageOff}
          title={copy.imagesTitle}
          action={
            <LinkButton href="#symptoms" variant="secondary">
              {copy.readSymptoms}
            </LinkButton>
          }
        >
          {copy.imagesBody}
        </EmptyState>
      </Shell>
    );
  }
  return (
    <Shell title="Images">
      <div className="shots" data-no-drag>
        {disease.images.map((image) => (
          <MagnifierImage
            key={image.url}
            src={image.url}
            alt={image.alt_text ?? `${disease.display_name} on ${disease.plant.name}`}
            caption={image.alt_text ?? undefined}
          />
        ))}
      </div>
    </Shell>
  );
}

/** The disease panels: Overview, Causes, Symptoms, Treatment, Prevention, Images. */
export function DiseaseView({
  disease,
  initialSize = "desktop",
}: {
  disease: DiseaseDetail;
  initialSize?: ViewportSize;
}) {
  const viewport = useViewportSize(initialSize);
  const phone = viewport === "phone";
  const size = phone ? ITEMS_PHONE : ITEMS_DESKTOP;

  const panels = useMemo<Panel[]>(
    () => [
      {
        id: "overview",
        title: "Overview",
        content: (
          <Shell
            title="Overview"
            aside={
              <Aside
                disease={disease}
                caption={
                  severityLevel(disease.severity)
                    ? `Severity: ${SEVERITY_LABELS[severityLevel(disease.severity)!]}`
                    : captionFor(disease)
                }
              />
            }
          >
            <Facts disease={disease} />
          </Shell>
        ),
      },
      { id: "causes", title: "Causes", content: <CausesPanel disease={disease} phone={phone} /> },
      ...listPanels({ id: "symptoms", title: "Symptoms", items: disease.symptoms, size, disease }),
      ...listPanels({
        id: "treatment",
        title: "Treatment",
        items: disease.treatments,
        size,
        disease,
        note: copy.treatmentNote,
      }),
      ...listPanels({
        id: "prevention",
        title: "Prevention",
        items: disease.preventions,
        size,
        disease,
      }),
      { id: "images", title: "Images", content: <ImagesPanel disease={disease} /> },
    ],
    [disease, phone, size],
  );

  return (
    <SlidePanels
      key={`${disease.plant.slug}-${disease.slug}-${size}`}
      label={`${disease.display_name} on ${disease.plant.name}`}
      panels={panels}
      showHint={!phone}
    />
  );
}
