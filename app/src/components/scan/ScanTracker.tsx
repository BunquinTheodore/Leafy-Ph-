"use client";

import { WifiOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { scanCopy } from "@/lib/i18n/scan-en";
import type { LabelOptions } from "@/lib/scans/labels";
import { stepFor } from "@/lib/scans/stages";
import type { ScanDetail } from "@/lib/scans/types";
import { useSfx } from "../sfx/SfxProvider";
import { Button } from "../ui/Button";
import { FailedView } from "./FailedView";
import { useScanPolling } from "./hooks";
import { ProgressPanel } from "./ProgressPanel";
import { ResultView } from "./ResultView";

const copy = scanCopy.progress;

interface ScanTrackerProps {
  /** Null while the photo is still uploading. */
  scanId: string | null;
  /** The scan as last known: the 202 stub, or the full record from the server. */
  initial: ScanDetail | null;
  uploadPercent?: number;
  /** The local preview while uploading, or the stored photo when resuming. */
  photoUrl: string | null;
  startedAtMs?: number | null;
  labels: LabelOptions | null;
  onCancelUpload?: () => void;
  onScanAnother?: () => void;
  /** "Try another photo" on a failed scan. */
  onAnotherPhoto?: () => void;
  onDeleted: () => void;
}

/**
 * One scan from upload to result: progress while it runs (and resuming one that is already
 * running), then the result panels, or a plain failure with Retry. Used by /scan and /scans/[id].
 */
export function ScanTracker({
  scanId,
  initial,
  uploadPercent = 0,
  photoUrl,
  startedAtMs = null,
  labels,
  onCancelUpload,
  onScanAnother,
  onAnotherPhoto,
  onDeleted,
}: ScanTrackerProps) {
  const { scan: polled, error, restart } = useScanPolling(scanId, initial);
  const scan = polled ?? initial;
  const sfx = useSfx();
  const wasProcessing = useRef(false);
  /** True once a scan this page was watching has just finished, so focus can move to the result. */
  const [justFinished, setJustFinished] = useState(false);

  useEffect(() => {
    if (!scan) return;
    if (scan.status === "processing") {
      wasProcessing.current = true;
      return;
    }
    if (wasProcessing.current) {
      wasProcessing.current = false;
      setJustFinished(true);
      sfx.play(scan.status === "completed" ? "scanDone" : "error");
    }
  }, [scan, sfx]);

  if (scan?.status === "completed") {
    return (
      <ResultView
        scan={scan}
        labels={labels}
        onScanAnother={onScanAnother}
        onDeleted={onDeleted}
        focusTitle={justFinished}
      />
    );
  }
  if (scan?.status === "failed") {
    return (
      <FailedView
        scan={scan}
        focusTitle={justFinished}
        onAnother={onAnotherPhoto}
        onRetried={() =>
          restart({ ...scan, status: "processing", stage: "analyzing", failure_code: null })
        }
      />
    );
  }
  if (error) {
    return (
      <div className="notice card card-glass" role="alert" data-testid="lost-connection">
        <WifiOff size={32} strokeWidth={1.5} aria-hidden="true" className="notice__icon" />
        <h1 className="h3">{copy.lostTitle}</h1>
        <p className="m-0">{copy.lostBody}</p>
        <Button onClick={() => restart()}>{copy.lostAction}</Button>
      </div>
    );
  }
  return (
    <div data-cursor="busy" className="tracker">
      <ProgressPanel
        step={stepFor({ uploading: scanId === null, scan })}
        uploadPercent={uploadPercent}
        startedAtMs={startedAtMs}
        photoUrl={photoUrl ?? scan?.image_url ?? null}
        onCancel={onCancelUpload}
      />
    </div>
  );
}
