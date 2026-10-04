import type { ApiResult, BrowserApiError } from "@/lib/api/browser";
import { parseScanCreated, type ScanCreated } from "./types";

export const UPLOAD_URL = "/api/scans";

const UNREACHABLE: BrowserApiError = {
  status: 503,
  code: "api_unreachable",
  message: "We could not reach Leafy. Check your connection and try again.",
  details: null,
};

/** The slice of XMLHttpRequest the uploader needs, so tests can supply a fake. */
export interface UploadRequest {
  status: number;
  responseText: string;
  upload: {
    onprogress:
      ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null;
  };
  onload: (() => void) | null;
  onerror: (() => void) | null;
  onabort: (() => void) | null;
  ontimeout: (() => void) | null;
  timeout: number;
  open(method: string, url: string): void;
  setRequestHeader(name: string, value: string): void;
  getResponseHeader(name: string): string | null;
  send(body: FormData): void;
  abort(): void;
}

export interface UploadOptions {
  /** Real percentage, 0 to 100, from XHR upload progress. */
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
  createRequest?: () => UploadRequest;
  /** Gives up when the upload makes no progress for this long (milliseconds). */
  timeoutMs?: number;
}

export type UploadResult =
  ApiResult<ScanCreated> | { ok: false; error: BrowserApiError; cancelled: true };

const DEFAULT_TIMEOUT_MS = 120_000;

function parseEnvelope(text: string): {
  success?: boolean;
  data?: unknown;
  error?: { code?: string; message?: string; details?: unknown } | null;
} | null {
  try {
    return JSON.parse(text) as ReturnType<typeof parseEnvelope>;
  } catch {
    return null;
  }
}

function failureFrom(request: UploadRequest): BrowserApiError {
  const envelope = parseEnvelope(request.responseText);
  const retry = Number.parseInt(request.getResponseHeader("retry-after") ?? "", 10);
  return {
    status: request.status,
    code: envelope?.error?.code ?? "internal_error",
    message: envelope?.error?.message ?? "Something went wrong on our side. Please try again.",
    details: envelope?.error?.details ?? null,
    retryAfterSeconds: Number.isFinite(retry) && retry >= 0 ? retry : undefined,
  };
}

/**
 * Sends the photo to the Next proxy with XMLHttpRequest so the browser reports real upload
 * progress. Resolves with a result and never throws; aborting resolves with `cancelled`.
 */
export function uploadScan(file: Blob, options: UploadOptions = {}): Promise<UploadResult> {
  const { onProgress, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const request = options.createRequest?.() ?? (new XMLHttpRequest() as unknown as UploadRequest);

  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve({ ok: false, error: { ...UNREACHABLE, code: "cancelled" }, cancelled: true });
      return;
    }
    const onAbortSignal = () => request.abort();
    signal?.addEventListener("abort", onAbortSignal, { once: true });
    const finish = (result: UploadResult) => {
      signal?.removeEventListener("abort", onAbortSignal);
      resolve(result);
    };

    request.open("POST", UPLOAD_URL);
    request.setRequestHeader("accept", "application/json");
    request.timeout = timeoutMs;
    request.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };
    request.onload = () => {
      const envelope = parseEnvelope(request.responseText);
      if (request.status >= 200 && request.status < 300 && envelope?.success === true) {
        const created = parseScanCreated(envelope.data);
        if (created) {
          onProgress?.(100);
          finish({ ok: true, data: created });
          return;
        }
      }
      finish({ ok: false, error: failureFrom(request) });
    };
    request.onerror = () => finish({ ok: false, error: UNREACHABLE });
    request.ontimeout = () => finish({ ok: false, error: UNREACHABLE });
    request.onabort = () =>
      finish({ ok: false, error: { ...UNREACHABLE, code: "cancelled" }, cancelled: true });

    const form = new FormData();
    form.append("image", file, file instanceof File ? file.name : "leaf.jpg");
    request.send(form);
  });
}
