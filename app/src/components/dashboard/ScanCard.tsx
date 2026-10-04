import { Leaf } from "lucide-react";
import Link from "next/link";
import { member } from "@/lib/i18n/member-en";
import { Badge, type BadgeTone } from "../ui/Display";
import { Progress } from "../ui/Progress";
import { scanLabel, type ScanSummary } from "./data";

const copy = member.dashboard;

const STAGE_LABELS: Record<string, string> = {
  validating: "Checking image",
  analyzing: "Analyzing leaf",
  saving: "Saving result",
};

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : DATE_FORMAT.format(date);
}

interface Status {
  tone: BadgeTone;
  label: string;
  detail: string | null;
}

/** Live status for a scan: what it is doing now, or how it ended. Never color only. */
export function statusFor(scan: ScanSummary): Status {
  if (scan.status === "processing") {
    return {
      tone: "info",
      label: copy.status.processing,
      detail: (scan.stage && STAGE_LABELS[scan.stage]) || null,
    };
  }
  if (scan.status === "failed") {
    return {
      tone: "high",
      label: copy.status.failed,
      detail: scan.failureCode === "ml_unavailable" ? copy.unavailable : null,
    };
  }
  if (scan.verdict === "healthy")
    return { tone: "healthy", label: copy.verdict.healthy, detail: null };
  if (scan.verdict === "disease") {
    return { tone: "moderate", label: copy.verdict.disease, detail: scan.diseaseName };
  }
  return { tone: "info", label: copy.verdict.unknown, detail: null };
}

/** One recent scan: photo, plant, status badge and date. The whole card opens the scan. */
export function ScanCard({ scan }: { scan: ScanSummary }) {
  const status = statusFor(scan);
  const label = scanLabel(scan);
  const date = formatDate(scan.createdAt);
  return (
    <li className="scan-card-item">
      <Link
        href={`/scans/${scan.id}`}
        className="scan-card card card-glass pressable"
        data-testid="scan-card"
        data-status={scan.status}
      >
        <span className="scan-card__thumb" aria-hidden="true">
          {scan.imageUrl ? (
            // Presigned URLs break the Next image optimizer, so a plain img is used on purpose.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={scan.imageUrl} alt="" loading="lazy" decoding="async" />
          ) : (
            <Leaf size={28} strokeWidth={1.5} />
          )}
        </span>
        <span className="scan-card__body">
          <span className="scan-card__title title-line">{label}</span>
          <span className="scan-card__detail title-line">{status.detail ?? " "}</span>
          <span className="scan-card__meta">
            <span role={scan.status === "processing" ? "status" : undefined}>
              <Badge tone={status.tone}>{status.label}</Badge>
            </span>
            {date ? (
              <time dateTime={scan.createdAt} className="scan-card__date">
                {date}
              </time>
            ) : null}
          </span>
          {scan.status === "processing" ? (
            <Progress
              label={`${label}: ${status.label}`}
              valueText={status.detail ?? status.label}
            />
          ) : null}
        </span>
      </Link>
    </li>
  );
}
