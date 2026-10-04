import type { ScanStage, ScanStatus } from "./types";

export type StepId = "uploading" | "checking" | "analyzing" | "saving" | "done";

export const STEP_ORDER: readonly StepId[] = [
  "uploading",
  "checking",
  "analyzing",
  "saving",
  "done",
];

export const STEP_LABELS: Readonly<Record<StepId, string>> = {
  uploading: "Uploading",
  checking: "Checking image",
  analyzing: "Analyzing leaf",
  saving: "Saving result",
  done: "Done",
};

const STAGE_TO_STEP: Readonly<Record<ScanStage, StepId>> = {
  validating: "checking",
  analyzing: "analyzing",
  saving: "saving",
};

interface StepInput {
  /** True while the browser is still sending the photo. */
  uploading: boolean;
  scan: { status: ScanStatus; stage: ScanStage | null } | null;
}

/** The stepper position, driven by the real upload state and the status the API reports. */
export function stepFor({ uploading, scan }: StepInput): StepId {
  if (uploading || !scan) return "uploading";
  if (scan.status === "completed") return "done";
  if (scan.stage) return STAGE_TO_STEP[scan.stage];
  return "checking";
}

export const stepIndex = (step: StepId): number => STEP_ORDER.indexOf(step);
