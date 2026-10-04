import type { StepId } from "./stages";

/** Where each step sits on the single bar. Uploading is real; the rest never fake completion. */
const BAR = {
  uploadEnd: 20,
  checkEnd: 32,
  analyzeEnd: 90,
  saveEnd: 98,
} as const;

/** Headroom so an eased step never touches the end of its range. */
const HEADROOM = 0.5;

const TAU_MS = {
  checking: 1500,
  analyzing: 9000,
  saving: 1200,
} as const;

/** 0 at the start, approaching 1 but never reaching it. */
export function easeToward(elapsedMs: number, tauMs: number): number {
  const safe = Math.max(0, elapsedMs);
  return 1 - Math.exp(-safe / tauMs);
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function eased(start: number, end: number, elapsedMs: number, tauMs: number): number {
  return start + easeToward(elapsedMs, tauMs) * (end - start - HEADROOM);
}

interface PercentInput {
  step: StepId;
  /** Real upload percentage, 0 to 100. */
  uploadPercent: number;
  /** Time spent in the current server step. */
  stepElapsedMs: number;
}

/** Overall bar percentage. It only reaches 100 when the step is done. */
export function overallPercent({ step, uploadPercent, stepElapsedMs }: PercentInput): number {
  switch (step) {
    case "uploading":
      return (clamp(uploadPercent, 0, 100) / 100) * BAR.uploadEnd;
    case "checking":
      return eased(BAR.uploadEnd, BAR.checkEnd, stepElapsedMs, TAU_MS.checking);
    case "analyzing":
      return eased(BAR.checkEnd, BAR.analyzeEnd, stepElapsedMs, TAU_MS.analyzing);
    case "saving":
      return eased(BAR.analyzeEnd, BAR.saveEnd, stepElapsedMs, TAU_MS.saving);
    case "done":
      return 100;
  }
}

/** Keeps the bar from moving backwards when a step restarts. */
export function monotonic(previous: number, next: number): number {
  return next < previous ? previous : next;
}

export const REASSURE_AFTER_MS = 8000;

/** Reassurance copy appears once the analysis has taken a while. */
export const shouldReassure = (step: StepId, stepElapsedMs: number): boolean =>
  step === "analyzing" && stepElapsedMs >= REASSURE_AFTER_MS;

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
