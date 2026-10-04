"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { scanCopy } from "@/lib/i18n/scan-en";
import { formatElapsed, monotonic, overallPercent, shouldReassure } from "@/lib/scans/progress";
import { STEP_LABELS, STEP_ORDER, type StepId } from "@/lib/scans/stages";
import { Button } from "../ui/Button";
import { Progress, Stepper } from "../ui/Progress";
import { useNow } from "./hooks";
import { ScanBeam } from "./ScanBeam";

const copy = scanCopy.progress;
const TICK_MS = 250;
const STEPS = STEP_ORDER.map((id) => ({ id, label: STEP_LABELS[id] }));

interface ProgressPanelProps {
  step: StepId;
  /** Real upload percentage, 0 to 100. */
  uploadPercent: number;
  /** When the work began, so a resumed scan shows its true elapsed time. */
  startedAtMs?: number | null;
  photoUrl: string | null;
  /** Shown while the upload is still running. */
  onCancel?: () => void;
}

/**
 * Where things stand: stepper, bar, elapsed time, reassurance and the scanning beam. The upload
 * percentage is real; the server steps ease toward 90 and only reach 100 when the result arrives.
 */
export function ProgressPanel({
  step,
  uploadPercent,
  startedAtMs = null,
  photoUrl,
  onCancel,
}: ProgressPanelProps) {
  const now = useNow(TICK_MS);
  const [mountedAt] = useState(() => Date.now());
  const [stepStart, setStepStart] = useState(() => Date.now());
  const shown = useRef(0);

  useEffect(() => setStepStart(Date.now()), [step]);

  const start = startedAtMs ?? mountedAt;
  const elapsed = now === 0 ? 0 : Math.max(0, now - start);
  const stepElapsed = now === 0 ? 0 : Math.max(0, now - stepStart);
  const raw = overallPercent({ step, uploadPercent, stepElapsedMs: stepElapsed });
  shown.current = monotonic(shown.current, raw);
  const percent = Math.round(shown.current);
  const label = STEP_LABELS[step];
  const detail = step === "uploading" ? copy.uploadingDetail(percent) : null;
  const uploading = step === "uploading";

  return (
    <section
      className="prog"
      aria-labelledby="prog-title"
      data-testid="progress-panel"
      data-step={step}
    >
      <div className="prog__scene">
        <ScanBeam photoUrl={photoUrl} step={step} />
      </div>
      <div className="prog__panel card card-glass card-vein">
        <p className="eyebrow m-0">{scanCopy.page.eyebrow}</p>
        <h1 id="prog-title" className="display display-sm prog__title">
          {copy.title}
        </h1>
        <Stepper steps={STEPS} current={step} label={copy.stepsLabel} />
        <Progress
          value={percent}
          label={copy.label}
          valueText={`${label}, ${copy.percent(percent)}`}
        />
        <div className="prog__meta">
          <span className="stat" data-testid="progress-percent">
            {percent}%
          </span>
          <span className="prog__time" data-testid="progress-elapsed">
            {copy.elapsed(formatElapsed(elapsed))}
          </span>
        </div>
        <p className="prog__detail m-0" data-testid="progress-detail">
          {detail ?? label}
        </p>
        {shouldReassure(step, stepElapsed) ? (
          <p className="prog__reassure m-0" data-testid="reassure">
            {copy.reassure}
          </p>
        ) : null}
        <p className="sr-only" role="status" aria-live="polite">
          {label}
        </p>
        <div className="prog__foot">
          <p className="m-0">{copy.leave}</p>
          <div className="prog__links">
            {uploading && onCancel ? (
              <Button variant="secondary" size="sm" onClick={onCancel} data-testid="cancel-upload">
                {copy.cancel}
              </Button>
            ) : (
              <Link href="/scans" className="vein-link">
                {copy.history}
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
