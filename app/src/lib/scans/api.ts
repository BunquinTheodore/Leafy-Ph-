import { callApi, type ApiResult } from "@/lib/api/browser";
import {
  parseScanDetail,
  parseScanPage,
  type ScanDetail,
  type ScanPage,
  type ScanVerdict,
} from "./types";
import type { ScanFetchResult } from "./polling";

const BAD_REPLY = {
  status: 502,
  code: "invalid_response",
  message: "Leafy sent an unexpected reply. Please try again.",
  details: null,
} as const;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ID = /^[0-9a-zA-Z-]{1,64}$/;

export const isSlug = (value: string): boolean => value.length <= 120 && SLUG.test(value);

function detailFrom(result: ApiResult<unknown>): ScanFetchResult {
  if (!result.ok) return result;
  const scan = parseScanDetail(result.data);
  return scan ? { ok: true, scan } : { ok: false, error: BAD_REPLY };
}

export async function fetchScan(id: string, signal?: AbortSignal): Promise<ScanFetchResult> {
  if (!ID.test(id)) return { ok: false, error: { ...BAD_REPLY, status: 404, code: "not_found" } };
  return detailFrom(await callApi(`/api/scans/${id}`, { signal }));
}

export interface ListQuery {
  limit?: number;
  cursor?: string | null;
  plant?: string | null;
  verdict?: ScanVerdict | null;
  status?: "processing" | "completed" | "failed" | null;
}

const MAX_LIMIT = 50;

/** Builds the query string for GET /scans. Unknown or unsafe values are left out. */
export function buildListQuery(query: ListQuery): string {
  const params = new URLSearchParams();
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(query.limit ?? 12)));
  params.set("limit", String(limit));
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.plant && isSlug(query.plant)) params.set("plant", query.plant);
  if (query.verdict) params.set("verdict", query.verdict);
  if (query.status) params.set("status", query.status);
  return params.toString();
}

export async function fetchScanPage(
  query: ListQuery,
  signal?: AbortSignal,
): Promise<ApiResult<ScanPage>> {
  const result = await callApi<unknown>(`/api/scans?${buildListQuery(query)}`, { signal });
  if (!result.ok) return result;
  const page = parseScanPage(result.data);
  return page ? { ok: true, data: page } : { ok: false, error: BAD_REPLY };
}

export async function retryScan(id: string): Promise<ApiResult<{ id: string }>> {
  const result = await callApi<{ id?: string }>(`/api/scans/${id}/retry`, { method: "POST" });
  if (!result.ok) return result;
  return { ok: true, data: { id: result.data?.id ?? id } };
}

/** keepalive lets a delete that is waiting out its undo window still go out when the tab closes. */
export async function deleteScan(id: string): Promise<boolean> {
  if (!ID.test(id)) return false;
  try {
    const response = await fetch(`/api/scans/${id}`, {
      method: "DELETE",
      credentials: "same-origin",
      cache: "no-store",
      keepalive: true,
    });
    return response.ok || response.status === 404;
  } catch {
    return false;
  }
}

export interface FeedbackInput {
  is_correct: boolean;
  correct_plant?: string | null;
  correct_disease?: string | null;
  comment?: string | null;
}

export async function sendFeedback(id: string, input: FeedbackInput): Promise<ApiResult<unknown>> {
  return callApi(`/api/scans/${id}/feedback`, { method: "PUT", json: input });
}

export const clearFeedback = (id: string): Promise<ApiResult<unknown>> =>
  callApi(`/api/scans/${id}/feedback`, { method: "DELETE" });

export type { ScanDetail };
