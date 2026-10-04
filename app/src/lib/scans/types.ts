import * as z from "zod/mini";
import "../zod-config";
import { SCAN_STAGES, SCAN_STATUSES, SCAN_VERDICTS } from "./constants";

/**
 * Scan DTOs, mirroring api/openapi.json (ScanDetailOut, ScanSummaryOut and friends). Responses are
 * validated at the boundary; a payload that does not match is treated as unusable, never trusted.
 * Uses zod/mini: the browser parses these replies and the classic build is about 17 KB gzipped
 * larger. Code that only needs the status names imports ./constants instead of this file.
 */
export * from "./constants";

const orNull = <T extends z.ZodMiniType>(schema: T) =>
  z.pipe(
    z.nullish(schema),
    z.transform((value) => value ?? null),
  );

const plantRef = z.object({ slug: z.string(), name: z.string() });

const scanDisease = z.object({
  slug: z.string(),
  name: z.string(),
  display_name: orNull(z.string()),
  severity: orNull(z.string()),
});

const diseaseDetail = z.object({
  slug: z.string(),
  name: z.string(),
  display_name: z.string(),
  plant: plantRef,
  cause: z.nullable(z.string()),
  pathogen_type: z.nullable(z.string()),
  pathogen_name: z.nullable(z.string()),
  severity: z.nullable(z.string()),
  symptoms: z.array(z.string()),
  treatments: z.array(z.string()),
  preventions: z.array(z.string()),
  affected_species: z.array(z.string()),
  images: z.array(z.object({ url: z.string(), alt_text: z.nullish(z.string()) })),
});

const feedback = z.object({
  is_correct: z.boolean(),
  correct_plant: z.nullable(z.string()),
  correct_disease: z.nullable(z.string()),
  comment: z.nullable(z.string()),
  updated_at: z.string(),
});

const summaryShape = {
  id: z.string().check(z.minLength(1)),
  status: z.enum(SCAN_STATUSES),
  stage: orNull(z.enum(SCAN_STAGES)),
  failure_code: orNull(z.string()),
  verdict: orNull(z.enum(SCAN_VERDICTS)),
  confidence: orNull(z.string()),
  plant: orNull(plantRef),
  disease: orNull(scanDisease),
  image_url: orNull(z.string()),
  image_expires_at: orNull(z.string()),
  created_at: z.string(),
  updated_at: orNull(z.string()),
};

export const scanSummarySchema = z.object(summaryShape);

export const scanDetailSchema = z.object({
  ...summaryShape,
  disease_detail: orNull(diseaseDetail),
  feedback: orNull(feedback),
});

export const scanListSchema = z.object({
  items: z.array(z.unknown()),
  next_cursor: orNull(z.string()),
});

export const scanCreatedSchema = z.object({
  id: z.string().check(z.minLength(1)),
  status: z.enum(SCAN_STATUSES),
  stage: orNull(z.enum(SCAN_STAGES)),
});

export type ScanSummary = z.infer<typeof scanSummarySchema>;
export type ScanDetail = z.infer<typeof scanDetailSchema>;
export type ScanFeedback = z.infer<typeof feedback>;
export type ScanDiseaseDetail = z.infer<typeof diseaseDetail>;
export type ScanCreated = z.infer<typeof scanCreatedSchema>;

export interface ScanPage {
  items: ScanSummary[];
  nextCursor: string | null;
}

export function parseScanDetail(raw: unknown): ScanDetail | null {
  const parsed = scanDetailSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function parseScanCreated(raw: unknown): ScanCreated | null {
  const parsed = scanCreatedSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Entries that do not validate are skipped so one bad row never hides the rest. */
export function parseScanPage(raw: unknown): ScanPage | null {
  const list = scanListSchema.safeParse(raw);
  if (!list.success) return null;
  const items = list.data.items.flatMap((item) => {
    const parsed = scanSummarySchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
  return { items, nextCursor: list.data.next_cursor };
}

export const isTerminal = (scan: Pick<ScanSummary, "status">): boolean =>
  scan.status !== "processing";

export const isLive = (scan: Pick<ScanSummary, "status">): boolean => scan.status === "processing";

/** A short plant label for cards and headings. */
export function plantLabel(scan: Pick<ScanSummary, "plant">, fallback: string): string {
  return scan.plant?.name ?? fallback;
}

/** Short disease name for cards; the full name stays for the detail title. */
export function diseaseLabel(scan: Pick<ScanSummary, "disease">): string | null {
  return scan.disease ? (scan.disease.display_name ?? scan.disease.name) : null;
}

/** A placeholder scan built from the 202 reply, until the first poll returns the full record. */
export function stubDetail(created: ScanCreated, now: Date = new Date()): ScanDetail {
  return {
    id: created.id,
    status: created.status,
    stage: created.stage,
    failure_code: null,
    verdict: null,
    confidence: null,
    plant: null,
    disease: null,
    image_url: null,
    image_expires_at: null,
    created_at: now.toISOString(),
    updated_at: null,
    disease_detail: null,
    feedback: null,
  };
}
