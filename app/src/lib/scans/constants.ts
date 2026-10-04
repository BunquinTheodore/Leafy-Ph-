/**
 * Scan status, stage and verdict names. Kept apart from the zod schemas in types.ts so that client
 * code which only needs the names does not pull the validation library into its bundle.
 */
export const SCAN_STATUSES = ["processing", "completed", "failed"] as const;
export const SCAN_STAGES = ["validating", "analyzing", "saving"] as const;
export const SCAN_VERDICTS = ["disease", "healthy", "unknown"] as const;

export type ScanStatus = (typeof SCAN_STATUSES)[number];
export type ScanStage = (typeof SCAN_STAGES)[number];
export type ScanVerdict = (typeof SCAN_VERDICTS)[number];
