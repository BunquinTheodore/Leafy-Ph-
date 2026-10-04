"use client";

import { RotateCw, ScanLine } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { scanCopy } from "@/lib/i18n/scan-en";
import { describeFailure, describeScanError, type ScanErrorView } from "@/lib/scans/errors";
import { retryScan } from "@/lib/scans/api";
import type { ScanDetail } from "@/lib/scans/types";
import { Button, LinkButton } from "../ui/Button";
import { Alert } from "../ui/Display";
import { ScanImage } from "./ScanImage";
import { ScanErrorPanel } from "./Notices";

const copy = scanCopy.failed;

interface FailedViewProps {
  scan: ScanDetail;
  /** Called once the API accepted the retry, so the caller starts polling again. */
  onRetried: () => void;
  /** Where "Try another photo" goes. Defaults to the scan page. */
  onAnother?: () => void;
  /** Move focus to the title (the scan has just failed while this page was watching). */
  focusTitle?: boolean;
}

/** A scan that did not finish: the reason in plain words, Retry on the stored photo, or a new photo. */
export function FailedView({ scan, onRetried, onAnother, focusTitle = false }: FailedViewProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusTitle) titleRef.current?.focus();
  }, [focusTitle]);
  const failure = describeFailure(scan.failure_code);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ScanErrorView | null>(null);

  async function retry() {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    const result = await retryScan(scan.id);
    setBusy(false);
    if (result.ok) {
      onRetried();
      return;
    }
    setProblem(describeScanError(result.error));
  }

  return (
    <section className="failed" aria-labelledby="failed-title" data-testid="failed-view">
      <div className="failed__photo">
        <ScanImage scanId={scan.id} src={scan.image_url} alt={copy.photoAlt} />
      </div>
      <div className="failed__body card card-glass card-vein">
        <p className="eyebrow m-0">{scanCopy.page.eyebrow}</p>
        <h1
          id="failed-title"
          ref={titleRef}
          tabIndex={-1}
          className="display display-sm failed__title"
        >
          {copy.title}
        </h1>
        <Alert tone="warning" title={failure.title}>
          {failure.body}
        </Alert>
        <p className="m-0 failed__note">{copy.savedNote}</p>
        {problem ? <ScanErrorPanel view={problem} onRetry={() => void retry()} /> : null}
        <div className="failed__actions">
          {failure.canRetry ? (
            <Button size="lg" onClick={() => void retry()} loading={busy} data-testid="retry-scan">
              <RotateCw size={20} strokeWidth={1.5} aria-hidden="true" />
              {busy ? copy.retrying : copy.retry}
            </Button>
          ) : null}
          {onAnother ? (
            <Button variant="secondary" size="lg" onClick={onAnother} data-testid="another-photo">
              <ScanLine size={20} strokeWidth={1.5} aria-hidden="true" />
              {copy.another}
            </Button>
          ) : (
            <LinkButton href="/scan" variant="secondary" size="lg" data-testid="another-photo">
              <ScanLine size={20} strokeWidth={1.5} aria-hidden="true" />
              {copy.another}
            </LinkButton>
          )}
        </div>
      </div>
    </section>
  );
}
