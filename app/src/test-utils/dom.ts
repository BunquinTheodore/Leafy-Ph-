import { vi } from "vitest";

/** jsdom lacks matchMedia; components read it through useSyncExternalStore. */
export function installMatchMedia(matches = false): void {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

/** jsdom does not implement the modal methods of <dialog>. */
export function installDialog(): void {
  const proto = HTMLDialogElement.prototype as unknown as Record<string, unknown>;
  proto.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  proto.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}

export function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

export const okEnvelope = (data: unknown = { ok: true }, status = 200): Response =>
  jsonResponse(status, { success: true, data, error: null });

export const errorEnvelope = (
  status: number,
  code: string,
  message = "Server message",
  details: unknown = null,
  headers: Record<string, string> = {},
): Response =>
  jsonResponse(status, { success: false, data: null, error: { code, message, details } }, headers);

export interface FetchCall {
  url: string;
  method: string;
  body: unknown;
}

/** Stubs global fetch with a handler and records every call. */
export function stubFetch(handler: (call: FetchCall) => Response | Promise<Response>) {
  const calls: FetchCall[] = [];
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof init?.body === "string" ? init.body : null;
    const call: FetchCall = {
      url: String(input),
      method: init?.method ?? "GET",
      body: raw ? JSON.parse(raw) : null,
    };
    calls.push(call);
    return handler(call);
  });
  vi.stubGlobal("fetch", mock);
  return { calls, mock };
}
