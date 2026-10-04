/**
 * Dashboard data contract: GET /scans/stats (ScanStatsOut) and GET /scans (ScanListOut) in
 * api/openapi.json. Replies are validated at the boundary; anything that does not match is dropped.
 */
import { member } from "@/lib/i18n/member-en";
import {
  SCAN_STATUSES,
  SCAN_VERDICTS,
  type ScanStatus,
  type ScanVerdict,
} from "@/lib/scans/constants";

export type { ScanStatus, ScanVerdict };

export interface ScanSummary {
  id: string;
  status: ScanStatus;
  stage: string | null;
  failureCode: string | null;
  verdict: ScanVerdict | null;
  plantName: string | null;
  diseaseName: string | null;
  confidence: string | null;
  createdAt: string;
  imageUrl: string | null;
}

export interface TopDisease {
  name: string;
  plantName: string | null;
  count: number;
}

export interface DashboardStats {
  total: number;
  last30Days: number;
  healthy: number;
  diseased: number;
  unknown: number;
  topDiseases: TopDisease[];
}

export interface Segment {
  key: "healthy" | "diseased" | "unknown";
  label: string;
  count: number;
  fraction: number;
}

const TOP_LIMIT = 5;
const STATUSES: readonly string[] = SCAN_STATUSES;
const VERDICTS: readonly string[] = SCAN_VERDICTS;

type Obj = Record<string, unknown>;

const isObj = (value: unknown): value is Obj =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

const count = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;

/** The name of a nested `{ slug, name }` reference such as ScanSummaryOut.plant. */
const refName = (value: unknown): string | null => (isObj(value) ? text(value.name) : null);

/** A disease reference reads best by its short display name. */
const diseaseRefName = (value: unknown): string | null =>
  isObj(value) ? (text(value.display_name) ?? text(value.name)) : null;

function normalizeTop(value: unknown): TopDisease[] {
  if (!Array.isArray(value)) return [];
  const rows = value.flatMap((item): TopDisease[] => {
    if (!isObj(item)) return [];
    const name = text(item.display_name) ?? text(item.disease_name);
    const total = count(item.count);
    if (!name || total === null || total === 0) return [];
    return [{ name, plantName: text(item.plant_name), count: total }];
  });
  return rows.sort((a, b) => b.count - a.count).slice(0, TOP_LIMIT);
}

/** Returns null when the payload is not a ScanStatsOut at all. */
export function normalizeStats(raw: unknown): DashboardStats | null {
  if (!isObj(raw)) return null;
  const total = count(raw.total);
  if (total === null) return null;
  const verdicts = isObj(raw.by_verdict) ? raw.by_verdict : {};
  return {
    total,
    last30Days: count(raw.last_30_days) ?? 0,
    healthy: count(verdicts.healthy) ?? 0,
    diseased: count(verdicts.disease) ?? 0,
    unknown: count(verdicts.unknown) ?? 0,
    topDiseases: normalizeTop(raw.top_diseases),
  };
}

function normalizeScan(raw: unknown): ScanSummary | null {
  if (!isObj(raw)) return null;
  const id = text(raw.id);
  const status = text(raw.status);
  if (!id || !status || !STATUSES.includes(status)) return null;
  const verdict = text(raw.verdict);
  return {
    id,
    status: status as ScanStatus,
    stage: text(raw.stage),
    failureCode: text(raw.failure_code),
    verdict: verdict && VERDICTS.includes(verdict) ? (verdict as ScanVerdict) : null,
    plantName: refName(raw.plant),
    diseaseName: diseaseRefName(raw.disease),
    confidence: text(raw.confidence),
    createdAt: text(raw.created_at) ?? "",
    imageUrl: text(raw.image_url),
  };
}

/** Reads ScanListOut (`{ items, next_cursor }`). Invalid entries are skipped. */
export function normalizeScanList(raw: unknown): ScanSummary[] {
  const list = isObj(raw) ? raw.items : null;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => {
    const scan = normalizeScan(item);
    return scan ? [scan] : [];
  });
}

export const isLive = (scan: ScanSummary): boolean => scan.status === "processing";

export const scanLabel = (scan: ScanSummary): string =>
  scan.plantName ?? member.dashboard.unknownPlant;

/** The three result groups with their share of all classified scans. */
export function splitSegments(
  parts: Pick<DashboardStats, "healthy" | "diseased" | "unknown">,
): Segment[] {
  const sum = parts.healthy + parts.diseased + parts.unknown;
  const share = (value: number) => (sum === 0 ? 0 : value / sum);
  const copy = member.dashboard;
  return [
    { key: "healthy", label: copy.healthy, count: parts.healthy, fraction: share(parts.healthy) },
    {
      key: "diseased",
      label: copy.diseased,
      count: parts.diseased,
      fraction: share(parts.diseased),
    },
    { key: "unknown", label: copy.unknown, count: parts.unknown, fraction: share(parts.unknown) },
  ];
}
