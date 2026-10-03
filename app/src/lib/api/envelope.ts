import { ApiError } from "./errors";
import type { ApiEnvelope } from "./types";

function readRetryAfter(response: Response): number | undefined {
  const raw = response.headers.get("retry-after");
  const seconds = raw === null ? Number.NaN : Number.parseInt(raw, 10);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

function isEnvelope(value: unknown): value is ApiEnvelope<unknown> {
  return typeof value === "object" && value !== null && "success" in value;
}

/** Reads the JSON body of a response, or null when it is not JSON. */
export async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function errorFromEnvelope(status: number, body: unknown, response?: Response): ApiError {
  const error = isEnvelope(body) ? body.error : null;
  return new ApiError({
    status,
    code: error?.code ?? "internal_error",
    message: error?.message ?? "Something went wrong on our side. Please try again.",
    details: error?.details,
    requestId: error?.request_id,
    retryAfterSeconds: response ? readRetryAfter(response) : undefined,
  });
}

/** Unwraps `{success, data, error}`. Throws ApiError for failures and for non JSON replies. */
export async function parseEnvelope<T>(response: Response): Promise<T> {
  const body = await readJson(response);
  if (response.ok && isEnvelope(body) && body.success) return body.data as T;
  throw errorFromEnvelope(response.ok ? 502 : response.status, body, response);
}
