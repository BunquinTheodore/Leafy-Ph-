"use client";

import { RotateCcw, ScanLine } from "lucide-react";
import { scanCopy } from "@/lib/i18n/scan-en";
import { Button } from "../ui/Button";

const copy = scanCopy.preview;

interface PhotoPreviewProps {
  url: string;
  fileName: string;
  busy?: boolean;
  onRetake: () => void;
  onAnalyze: () => void;
}

/** The chosen photo, with Retake and Analyze. Nothing is uploaded until Analyze. */
export function PhotoPreview({
  url,
  fileName,
  busy = false,
  onRetake,
  onAnalyze,
}: PhotoPreviewProps) {
  return (
    <div className="preview card card-glass card-vein">
      <div className="preview__frame">
        {/* A blob URL of the user's own file, so the Next optimizer does not apply. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={copy.alt} data-testid="preview-image" />
      </div>
      <p className="preview__name title-line m-0">{copy.fileName(fileName)}</p>
      <div className="preview__actions">
        <Button variant="secondary" size="lg" onClick={onRetake} disabled={busy}>
          <RotateCcw size={20} strokeWidth={1.5} aria-hidden="true" />
          {copy.retake}
        </Button>
        <Button size="lg" onClick={onAnalyze} loading={busy} data-sfx="scanStart">
          <ScanLine size={20} strokeWidth={1.5} aria-hidden="true" />
          {copy.analyze}
        </Button>
      </div>
    </div>
  );
}
