"use client";

import { ImageOff } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { scanCopy } from "@/lib/i18n/scan-en";
import { severityLevel } from "@/lib/handbook/severity";
import type { LabelOptions } from "@/lib/scans/labels";
import { chunkItems, confidenceLabel } from "@/lib/scans/panels";
import type { ScanDetail } from "@/lib/scans/types";
import { diseaseLabel } from "@/lib/scans/types";
import { MagnifierImage } from "../handbook/MagnifierImage";
import { SeverityBadge } from "../handbook/SeverityBadge";
import type { Panel } from "../slide-panels/SlidePanels";
import { Badge } from "../ui/Display";
import { EmptyState } from "../ui/Display";
import { LinkButton } from "../ui/Button";
import { Feedback } from "./Feedback";
import { LeafOrbit } from "./LeafOrbit";
import { ScanImage } from "./ScanImage";

const copy = scanCopy.result;

/** The user's own photo beside the text on wide screens, so every panel keeps its context. */
function PhotoAside({ scan }: { scan: ScanDetail }) {
  return (
    <div className="dp__aside">
      <div className="aside-photo">
        <ScanImage scanId={scan.id} src={scan.image_url} alt={copy.photoAlt} />
      </div>
      <p className="dp__caption">{scan.plant?.name ?? copy.unknownPlant}</p>
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

function List({ items }: { items: string[] }) {
  return (
    <ol className="plist">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ol>
  );
}

function listPanels(
  scan: ScanDetail,
  id: string,
  title: string,
  items: string[],
  size: number,
  note?: string,
): Panel[] {
  if (items.length === 0) return [];
  const pages = chunkItems(items, size);
  return pages.map((page, index) => {
    const many = pages.length > 1;
    return {
      id: index === 0 ? id : `${id}-${index + 1}`,
      title: many ? `${title} ${index + 1}` : title,
      content: (
        <Shell
          title={many ? `${title} ${index + 1} of ${pages.length}` : title}
          aside={<PhotoAside scan={scan} />}
        >
          <List items={page} />
          {note ? <p className="note">{note}</p> : null}
        </Shell>
      ),
    };
  });
}

interface FactsProps {
  scan: ScanDetail;
}

function Facts({ scan }: FactsProps) {
  const confidence = confidenceLabel(scan.confidence);
  const disease = diseaseLabel(scan);
  const rows: Array<[string, ReactNode]> = [
    [
      copy.plant,
      scan.plant ? (
        <Link key="plant" href={`/handbook/${scan.plant.slug}`} className="vein-link">
          {scan.plant.name}
        </Link>
      ) : (
        copy.notIdentified
      ),
    ],
  ];
  if (scan.verdict === "disease") rows.push([copy.disease, disease ?? copy.notIdentified]);
  if (scan.verdict === "healthy") rows.push([copy.verdict, copy.noDisease]);
  if (scan.verdict === "disease" && severityLevel(scan.disease?.severity)) {
    rows.push([
      copy.severity,
      <SeverityBadge key="sev" severity={scan.disease?.severity ?? null} withPrefix={false} />,
    ]);
  }
  if (confidence) rows.push([copy.confidence, confidence]);
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

function VerdictBadge({ scan }: FactsProps) {
  if (scan.verdict === "healthy")
    return <Badge tone="healthy">{scanCopy.history.verdicts.healthy}</Badge>;
  if (scan.verdict === "disease") {
    return (
      <Badge tone={severityLevel(scan.disease?.severity) ?? "moderate"}>
        {scanCopy.history.verdicts.disease}
      </Badge>
    );
  }
  return <Badge tone="info">{scanCopy.history.verdicts.unknown}</Badge>;
}

function ResultPanel({ scan, labels }: { scan: ScanDetail; labels: LabelOptions | null }) {
  const lead =
    scan.verdict === "healthy"
      ? copy.healthyLead
      : scan.verdict === "unknown"
        ? copy.unknownLead
        : null;
  return (
    <div className="res">
      <div className="res__photo">
        <LeafOrbit scan={scan} />
      </div>
      <div className="res__info">
        <VerdictBadge scan={scan} />
        {lead ? <p className="res__lead m-0">{lead}</p> : null}
        <Facts scan={scan} />
        <Feedback scanId={scan.id} initial={scan.feedback} labels={labels} />
      </div>
    </div>
  );
}

function CausesPanel({ scan }: { scan: ScanDetail }) {
  const detail = scan.disease_detail;
  const species = detail?.affected_species.slice(0, 8) ?? [];
  return (
    <Shell title={copy.causesTitle} aside={<PhotoAside scan={scan} />}>
      <div className="prose">
        <p>{detail?.cause ?? copy.causesFallback}</p>
        {detail?.pathogen_name ? (
          <p>
            Pathogen: <em>{detail.pathogen_name}</em>
          </p>
        ) : null}
      </div>
      {species.length > 0 ? (
        <div>
          <p className="eyebrow m-0 mb-2">{copy.alsoAffects}</p>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {species.map((name) => (
              <li key={name} className="chip">
                {name}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Shell>
  );
}

function PhotosPanel({ scan }: { scan: ScanDetail }) {
  const detail = scan.disease_detail;
  const images = detail?.images ?? [];
  if (!detail || images.length === 0) {
    return (
      <Shell title={copy.photosTitle}>
        <EmptyState
          icon={ImageOff}
          title={copy.photosEmptyTitle}
          action={
            <LinkButton href="#symptoms" variant="secondary" data-testid="photos-empty-action">
              {copy.readSymptoms}
            </LinkButton>
          }
        >
          {copy.photosEmptyBody}
        </EmptyState>
      </Shell>
    );
  }
  return (
    <Shell title={copy.photosTitle}>
      <div className="shots" data-no-drag>
        {images.map((image) => (
          <MagnifierImage
            key={image.url}
            src={image.url}
            alt={image.alt_text ?? `${detail.display_name} on ${detail.plant.name}`}
            caption={image.alt_text ?? undefined}
          />
        ))}
      </div>
    </Shell>
  );
}

function TipsPanel({
  scan,
  title,
  items,
  action,
}: {
  scan: ScanDetail;
  title: string;
  items: readonly string[];
  action: ReactNode;
}) {
  return (
    <Shell title={title} aside={<PhotoAside scan={scan} />}>
      <List items={[...items]} />
      <div>{action}</div>
    </Shell>
  );
}

/** Builds the panels for a finished scan, one set per verdict. */
export function buildResultPanels(
  scan: ScanDetail,
  labels: LabelOptions | null,
  size: number,
): Panel[] {
  const result: Panel = {
    id: "result",
    title: copy.resultTab,
    content: <ResultPanel scan={scan} labels={labels} />,
  };
  if (scan.verdict === "healthy") {
    return [
      result,
      {
        id: "care",
        title: copy.careTab,
        content: (
          <TipsPanel
            scan={scan}
            title={copy.careTitle}
            items={copy.careItems}
            action={
              scan.plant ? (
                <LinkButton href={`/handbook/${scan.plant.slug}`} variant="secondary">
                  {copy.openPlant}
                </LinkButton>
              ) : null
            }
          />
        ),
      },
    ];
  }
  if (scan.verdict !== "disease") {
    return [
      result,
      {
        id: "retake",
        title: copy.retakeTab,
        content: (
          <TipsPanel
            scan={scan}
            title={copy.retakeTitle}
            items={copy.retakeItems}
            action={
              <LinkButton href="/scan" data-testid="retake-cta">
                {copy.scanAnother}
              </LinkButton>
            }
          />
        ),
      },
    ];
  }
  if (!scan.disease_detail) {
    return [
      result,
      {
        id: "notes",
        title: copy.causesTab,
        content: (
          <Shell title={copy.noDetailTitle}>
            <p className="blurb m-0">{copy.noDetailBody}</p>
          </Shell>
        ),
      },
    ];
  }
  const detail = scan.disease_detail;
  return [
    result,
    { id: "causes", title: copy.causesTab, content: <CausesPanel scan={scan} /> },
    ...listPanels(scan, "symptoms", copy.symptomsTab, detail.symptoms, size),
    ...listPanels(
      scan,
      "treatment",
      copy.treatmentTab,
      detail.treatments,
      size,
      copy.treatmentNote,
    ),
    ...listPanels(scan, "prevention", copy.preventionTab, detail.preventions, size),
    { id: "photos", title: copy.photosTab, content: <PhotosPanel scan={scan} /> },
  ];
}
