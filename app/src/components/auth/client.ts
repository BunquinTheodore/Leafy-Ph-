import { messageForCode } from "./messages";

export type AuthResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      /** Seconds to wait, only for rate limits. */
      retryAfter?: number;
      /** Field names the API flagged (validation_error details), such as "password". */
      fields: string[];
    };

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

const DEFAULT_RETRY_SECONDS = 60;

interface EnvelopeLike {
  success?: boolean;
  data?: unknown;
  error?: { code?: string; details?: unknown } | null;
}

function fieldsFrom(details: unknown): string[] {
  if (!Array.isArray(details)) return [];
  return details.flatMap((item) => {
    const field = (item as { field?: unknown } | null)?.field;
    return typeof field === "string" && field ? [field] : [];
  });
}

function parseRetryAfter(response: Response): number {
  const seconds = Number.parseInt(response.headers.get("retry-after") ?? "", 10);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_RETRY_SECONDS;
}

/** POSTs JSON to one of our own `/api/auth/*` routes. Never throws; errors become typed results. */
export async function postAuth<T>(
  path: string,
  body: unknown,
  doFetch: Fetcher = (input, init) => fetch(input, init),
): Promise<AuthResult<T>> {
  let response: Response;
  try {
    response = await doFetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return {
      ok: false,
      status: 0,
      code: "api_unreachable",
      message: messageForCode("api_unreachable"),
      fields: [],
    };
  }

  let payload: EnvelopeLike | null = null;
  try {
    payload = (await response.json()) as EnvelopeLike;
  } catch {
    payload = null;
  }

  if (response.ok && payload?.success) return { ok: true, data: payload.data as T };

  const code = payload?.error?.code ?? "internal_error";
  const failure: AuthResult<T> = {
    ok: false,
    status: response.status,
    code,
    message: messageForCode(code),
    fields: fieldsFrom(payload?.error?.details),
  };
  return code === "rate_limited" ? { ...failure, retryAfter: parseRetryAfter(response) } : failure;
}
