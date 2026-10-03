export interface ApiErrorInit {
  status: number;
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
  retryAfterSeconds?: number;
}

/** Error raised for any non success API envelope or transport failure. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  readonly requestId: string | undefined;
  readonly retryAfterSeconds: number | undefined;

  constructor(init: ApiErrorInit) {
    super(init.message);
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code;
    this.details = init.details ?? null;
    this.requestId = init.requestId;
    this.retryAfterSeconds = init.retryAfterSeconds;
  }
}

export const isApiError = (value: unknown): value is ApiError => value instanceof ApiError;
