"use client";

import { Trash2 } from "lucide-react";
import Link from "next/link";
import { scanCopy } from "@/lib/i18n/scan-en";
import { severityLevel } from "@/lib/handbook/severity";
import { STEP_LABELS, stepFor } from "@/lib/scans/stages";
import { diseaseLabel, plantLabel, type ScanSummary } from "@/lib/scans/types";
import { Badge, type BadgeTone } from "../ui/Display";
import { Progress } from "../ui/Progress";
import { ScanImage } from "./ScanImage";

const copy = scanCopy.history;

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : DATE_FORMAT.format(date);
}

interface StatusView {
  tone: BadgeTone;
  label: string;
  detail: string | null;
}

/** Live status for a scan: what it is doing now, or how it ended. Never colour only. */
export function statusView(scan: ScanSummary): StatusView {
  if (scan.status === "processing") {
    const step = stepFor({ uploading: false, scan });
    return { tone: "info", label: copy.status.processing, detail: STEP_LABELS[step] };
  }
  if (scan.status === "failed") {
    return {
      tone: "high",
      label: copy.status.failed,
      detail: scan.failure_code === "ml_unavailable" ? copy.unavailable : null,
    };
  }
  if (scan.verdict === "healthy") {
    return { tone: "healthy", label: copy.verdicts.healthy, detail: null };
  }
  if (scan.verdict === "disease") {
    return {
      tone: severityLevel(scan.disease?.severity) ?? "moderate",
      label: copy.verdicts.disease,
      detail: diseaseLabel(scan),
    };
  }
  return { tone: "info", label: copy.verdicts.unknown, detail: null };
}

interface HistoryCardProps {
  scan: ScanSummary;
  onDelete: (scan: ScanSummary) => void;
}

/** One scan: photo, plant, status badge and date. The card opens the scan; Delete sits below. */
export function HistoryCard({ scan, onDelete }: HistoryCardProps) {
  const status = statusView(scan);
  const label = plantLabel(scan, copy.unknownPlant);
  const date = formatDate(scan.created_at);
  return (
    <article
      className="hcard card card-glass"
      data-testid="history-card"
      data-status={scan.status}
      data-verdict={scan.verdict ?? undefined}
    >
      <Link href={`/scans/${scan.id}`} className="hcard__link pressable">
        <span className="hcard__thumb">
          <ScanImage scanId={scan.id} src={scan.image_url} alt="" />
        </span>
        <span className="hcard__body">
          <span className="hcard__title title-line">{label}</span>
          <span className="hcard__detail title-line">{status.detail ?? " "}</span>
          <span
            className="hcard__badges"
            role={scan.status === "processing" ? "status" : undefined}
          >
            <Badge tone={status.tone}>{status.label}</Badge>
          </span>
          {scan.status === "processing" ? (
            <Progress
              label={`${label}: ${status.detail ?? status.label}`}
              valueText={status.detail ?? status.label}
            />
          ) : null}
        </span>
      </Link>
      <div className="hcard__foot">
        {date ? (
          <time dateTime={scan.created_at} className="hcard__date">
            {date}
          </time>
        ) : (
          <span />
        )}
        <button
          type="button"
          className="btn btn-ghost btn-sm btn-icon pressable"
          aria-label={copy.delete(`${label}, ${date}`)}
          onClick={() => onDelete(scan)}
          data-sfx="none"
          data-testid="history-delete"
        >
          <Trash2 size={16} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}
