import type { BrowserApiError } from "@/lib/api/browser";
import { isTerminal, type ScanDetail } from "./types";

const FAST_MS = 1000;
const MID_MS = 1500;
const SLOW_MS = 2000;
const FAST_ATTEMPTS = 5;
const MID_ATTEMPTS = 10;
/** After this many failed reads in a row the poller reports the error and stops. */
export const MAX_CONSECUTIVE_FAILURES = 5;

/** 1s at first, backing off to 2s. Attempt 0 is the wait before the first read. */
export function pollDelay(attempt: number): number {
  if (attempt < FAST_ATTEMPTS) return FAST_MS;
  if (attempt < MID_ATTEMPTS) return MID_MS;
  return SLOW_MS;
}

export type ScanFetchResult =
  { ok: true; scan: ScanDetail } | { ok: false; error: BrowserApiError };

export type ScanFetch = (id: string, signal: AbortSignal) => Promise<ScanFetchResult>;

interface PollOptions {
  id: string;
  fetchScan: ScanFetch;
  signal: AbortSignal;
  onUpdate: (scan: ScanDetail) => void;
  /** Called when reads keep failing, or the scan is gone. */
  onError: (error: BrowserApiError) => void;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const done = () => {
      signal.removeEventListener("abort", done);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });
}

/**
 * Polls a scan until it completes or fails. Transient failures are tolerated; a 404 or a
 * session error stops at once. Returns when finished or aborted.
 */
export async function pollScan(options: PollOptions): Promise<void> {
  const { id, fetchScan, signal, onUpdate, onError, sleep = abortableSleep } = options;
  let attempt = 0;
  let failures = 0;
  while (!signal.aborted) {
    await sleep(pollDelay(attempt), signal);
    if (signal.aborted) return;
    attempt += 1;
    const result = await fetchScan(id, signal);
    if (signal.aborted) return;
    if (result.ok) {
      failures = 0;
      onUpdate(result.scan);
      if (isTerminal(result.scan)) return;
      continue;
    }
    const definitive = result.error.status === 404 || result.error.status === 401;
    failures += 1;
    if (definitive || failures >= MAX_CONSECUTIVE_FAILURES) {
      onError(result.error);
      return;
    }
  }
}
