"use client";

import { BookOpen, ScanLine, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { scanCopy } from "@/lib/i18n/scan-en";
import type { LabelOptions } from "@/lib/scans/labels";
import { ITEMS_DESKTOP, ITEMS_PHONE } from "@/lib/scans/panels";
import type { ScanDetail } from "@/lib/scans/types";
import { useMediaQuery } from "../interaction/hooks";
import { useSfx } from "../sfx/SfxProvider";
import { SlidePanels } from "../slide-panels/SlidePanels";
import { Button, LinkButton } from "../ui/Button";
import { useToast } from "../ui/Toast";
import { deleteWithUndo } from "./delete";
import { buildResultPanels } from "./ResultPanels";

const copy = scanCopy.result;

interface Headline {
  eyebrow: string;
  title: string;
}

function headlineFor(scan: ScanDetail): Headline {
  if (scan.verdict === "healthy") {
    return { eyebrow: scan.plant?.name ?? copy.unknownPlant, title: copy.healthyTitle };
  }
  if (scan.verdict === "disease") {
    const name = scan.disease_detail?.name ?? scan.disease?.name ?? copy.notIdentified;
    return { eyebrow: copy.diseaseEyebrow, title: name };
  }
  return { eyebrow: scan.plant?.name ?? copy.unknownPlant, title: copy.unknownTitle };
}

export function handbookHref(scan: Pick<ScanDetail, "plant" | "disease">): string | null {
  if (!scan.plant) return null;
  return scan.disease
    ? `/handbook/${scan.plant.slug}/${scan.disease.slug}`
    : `/handbook/${scan.plant.slug}`;
}

interface ResultViewProps {
  scan: ScanDetail;
  labels: LabelOptions | null;
  /** Scan page: reset to the dropzone. History page: go to /scan. */
  onScanAnother?: () => void;
  /** Runs right after Delete, so the caller can leave the page while Undo is open. */
  onDeleted: () => void;
  /** Move focus to the title (a scan this page was watching has just finished). */
  focusTitle?: boolean;
}

/** The finished scan as sideways panels, with Scan another, Open in handbook and Delete on top. */
export function ResultView({
  scan,
  labels,
  onScanAnother,
  onDeleted,
  focusTitle = false,
}: ResultViewProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusTitle) titleRef.current?.focus();
  }, [focusTitle]);
  const toast = useToast();
  const sfx = useSfx();
  const roomy = useMediaQuery("(min-width: 721px)");
  const size = roomy ? ITEMS_DESKTOP : ITEMS_PHONE;
  const headline = headlineFor(scan);
  const handbook = handbookHref(scan);
  const panels = useMemo(() => buildResultPanels(scan, labels, size), [scan, labels, size]);

  function remove() {
    deleteWithUndo({
      id: scan.id,
      toast,
      playDelete: () => sfx.play("delete"),
    });
    onDeleted();
  }

  return (
    <section
      className="rv"
      aria-labelledby="rv-title"
      data-testid="result-view"
      data-verdict={scan.verdict}
    >
      <header className="rv__head">
        <div className="rv__titles">
          <p className="eyebrow m-0 rv__eyebrow">{headline.eyebrow}</p>
          <h1 id="rv-title" ref={titleRef} tabIndex={-1} className="display display-sm rv__title">
            {headline.title}
          </h1>
        </div>
        <div className="rv__actions">
          {onScanAnother ? (
            <Button size="sm" onClick={onScanAnother} data-testid="scan-another">
              <ScanLine size={16} strokeWidth={1.5} aria-hidden="true" />
              {copy.scanAnother}
            </Button>
          ) : (
            <LinkButton href="/scan" size="sm" data-testid="scan-another">
              <ScanLine size={16} strokeWidth={1.5} aria-hidden="true" />
              {copy.scanAnother}
            </LinkButton>
          )}
          {handbook ? (
            <LinkButton
              href={handbook}
              variant="secondary"
              size="sm"
              aria-label={copy.openHandbook}
              data-testid="open-handbook"
            >
              <BookOpen size={16} strokeWidth={1.5} aria-hidden="true" />
              <span className="rv__wide" aria-hidden="true">
                {copy.openHandbook}
              </span>
              <span className="rv__narrow" aria-hidden="true">
                {copy.handbookShort}
              </span>
            </LinkButton>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={remove}
            aria-label={copy.deleteScan}
            data-testid="delete-scan"
            data-sfx="none"
          >
            <Trash2 size={16} strokeWidth={1.5} aria-hidden="true" />
            <span className="rv__wide" aria-hidden="true">
              {copy.deleteScan}
            </span>
          </Button>
        </div>
      </header>
      <div className="rv__panels">
        <SlidePanels
          key={`${scan.id}-${size}-${scan.verdict}`}
          label={copy.panelsLabel}
          panels={panels}
        />
      </div>
    </section>
  );
}
