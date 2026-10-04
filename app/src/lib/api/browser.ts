export interface BrowserApiError {
  status: number;
  code: string;
  message: string;
  details: unknown;
  retryAfterSeconds?: number;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: BrowserApiError };

interface CallOptions {
  method?: string;
  json?: unknown;
  signal?: AbortSignal;
}

const UNREACHABLE: BrowserApiError = {
  status: 503,
  code: "api_unreachable",
  message: "We could not reach Leafy. Check your connection and try again.",
  details: null,
};

const GENERIC: Omit<BrowserApiError, "status"> = {
  code: "internal_error",
  message: "Something went wrong on our side. Please try again.",
  details: null,
};

function retryAfter(response: Response): number | undefined {
  const parsed = Number.parseInt(response.headers.get("retry-after") ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

/** Browser side call to a Next route handler (never to FastAPI). Returns a result, never throws. */
export async function callApi<T = unknown>(
  path: string,
  options: CallOptions = {},
): Promise<ApiResult<T>> {
  const headers = new Headers({ accept: "application/json" });
  let body: string | undefined;
  if (options.json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(options.json);
  }
  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? "GET",
      headers,
      body,
      credentials: "same-origin",
      cache: "no-store",
      signal: options.signal,
    });
  } catch {
    return { ok: false, error: UNREACHABLE };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  const envelope = payload as {
    success?: boolean;
    data?: T;
    error?: { code?: string; message?: string; details?: unknown } | null;
  } | null;

  if (response.ok && envelope?.success === true) return { ok: true, data: envelope.data as T };
  return {
    ok: false,
    error: {
      status: response.status,
      code: envelope?.error?.code ?? GENERIC.code,
      message: envelope?.error?.message ?? GENERIC.message,
      details: envelope?.error?.details ?? null,
      retryAfterSeconds: retryAfter(response),
    },
  };
}
