"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { scanCopy } from "@/lib/i18n/scan-en";
import { describeScanError, type ScanErrorView } from "@/lib/scans/errors";
import type { LabelOptions } from "@/lib/scans/labels";
import { stubDetail, type ScanDetail } from "@/lib/scans/types";
import { uploadScan } from "@/lib/scans/upload";
import {
  checkDimensions,
  checkFile,
  FILE_PROBLEM_MESSAGES,
  readDimensions,
} from "@/lib/scans/validation";
import { useSfx } from "../sfx/SfxProvider";
import { useToast } from "../ui/Toast";
import { Dropzone } from "./Dropzone";
import { ScanErrorPanel } from "./Notices";
import { PhotoPreview } from "./PhotoPreview";
import { ScanTracker } from "./ScanTracker";
import { TipCard } from "./TipCard";
import "./scan.css";

const copy = scanCopy;

type Phase =
  | { kind: "idle" }
  | { kind: "preview"; file: File; url: string }
  | { kind: "error"; file: File; url: string; view: ScanErrorView }
  | {
      kind: "working";
      file: File;
      url: string;
      startedAt: number;
      percent: number;
      scanId: string | null;
      initial: ScanDetail | null;
    };

interface ScanFlowProps {
  labels: LabelOptions | null;
}

/** /scan: tip card, dropzone, preview, upload with real progress, then the tracker takes over. */
export function ScanFlow({ labels }: ScanFlowProps) {
  const router = useRouter();
  const toast = useToast();
  const sfx = useSfx();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [problem, setProblem] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const urlRef = useRef<string | null>(null);

  const releaseUrl = useCallback(() => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
  }, []);

  useEffect(() => releaseUrl, [releaseUrl]);

  // Leaving while the photo is still going up would lose it, so the browser asks first.
  const uploading = phase.kind === "working" && phase.scanId === null;
  useEffect(() => {
    if (!uploading) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploading]);

  const reset = useCallback(() => {
    releaseUrl();
    setProblem(null);
    setPhase({ kind: "idle" });
  }, [releaseUrl]);

  const acceptFile = useCallback(
    async (file: File) => {
      setProblem(null);
      const fileProblem = checkFile(file);
      if (fileProblem) {
        setProblem(FILE_PROBLEM_MESSAGES[fileProblem]);
        return;
      }
      setChecking(true);
      const size = await readDimensions(file);
      setChecking(false);
      const dimensionProblem = size ? checkDimensions(size.width, size.height) : "unreadable";
      if (dimensionProblem) {
        setProblem(FILE_PROBLEM_MESSAGES[dimensionProblem]);
        return;
      }
      releaseUrl();
      const url = URL.createObjectURL(file);
      urlRef.current = url;
      setPhase({ kind: "preview", file, url });
    },
    [releaseUrl],
  );

  const analyze = useCallback(
    async (file: File, url: string) => {
      const abort = new AbortController();
      controller.current = abort;
      setPhase({
        kind: "working",
        file,
        url,
        startedAt: Date.now(),
        percent: 0,
        scanId: null,
        initial: null,
      });
      const result = await uploadScan(file, {
        signal: abort.signal,
        onProgress: (percent) =>
          setPhase((current) =>
            current.kind === "working" && current.scanId === null
              ? { ...current, percent }
              : current,
          ),
      });
      if (result.ok) {
        setPhase((current) =>
          current.kind === "working"
            ? { ...current, percent: 100, scanId: result.data.id, initial: stubDetail(result.data) }
            : current,
        );
        return;
      }
      if ("cancelled" in result) {
        toast({ message: copy.progress.cancelled, tone: "info" });
        setPhase({ kind: "preview", file, url });
        return;
      }
      sfx.play("error");
      setPhase({ kind: "error", file, url, view: describeScanError(result.error) });
    },
    [sfx, toast],
  );

  const cancelUpload = () => controller.current?.abort();
  const goToList = () => router.push("/scans");

  if (phase.kind === "working") {
    return (
      <div className="scan scan--tracking stage-fill">
        <ScanTracker
          scanId={phase.scanId}
          initial={phase.initial}
          uploadPercent={phase.percent}
          photoUrl={phase.url}
          startedAtMs={phase.startedAt}
          labels={labels}
          onCancelUpload={cancelUpload}
          onScanAnother={reset}
          onAnotherPhoto={reset}
          onDeleted={goToList}
        />
      </div>
    );
  }

  return (
    <div
      className="scan stage-fill wide-stage"
      data-width="standard"
      data-compact={phase.kind !== "idle" || undefined}
    >
      <div className="wide-container split split--top scan__split">
        <div className="scan__intro">
          <p className="eyebrow m-0">{copy.page.eyebrow}</p>
          <h1 className="display display-sm">{copy.page.title}</h1>
          <p className="blurb m-0">{copy.page.lede}</p>
          <TipCard />
        </div>
        <div className="scan__main">
          {phase.kind === "error" ? (
            <ScanErrorPanel
              view={phase.view}
              onRetry={() => void analyze(phase.file, phase.url)}
              onChooseAnother={reset}
            />
          ) : phase.kind === "preview" ? (
            <PhotoPreview
              url={phase.url}
              fileName={phase.file.name}
              onRetake={reset}
              onAnalyze={() => void analyze(phase.file, phase.url)}
            />
          ) : (
            <Dropzone
              onFile={(file) => void acceptFile(file)}
              problem={problem}
              disabled={checking}
            />
          )}
        </div>
      </div>
    </div>
  );
}
