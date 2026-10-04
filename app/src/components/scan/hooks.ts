"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { BrowserApiError } from "@/lib/api/browser";
import { fetchScan } from "@/lib/scans/api";
import { hiddenSnapshot, subscribeHidden } from "@/lib/scans/pending-deletes";
import { pollScan } from "@/lib/scans/polling";
import { isTerminal, type ScanDetail } from "@/lib/scans/types";

const EMPTY: ReadonlySet<string> = new Set();

/** Scan ids that are waiting out their undo window or were just deleted. Lists hide them. */
export function useHiddenScans(): ReadonlySet<string> {
  return useSyncExternalStore(subscribeHidden, hiddenSnapshot, () => EMPTY);
}

/** Current time, refreshed on an interval while `active`. 0 before the first client render. */
export function useNow(intervalMs: number, active = true): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs]);
  return now;
}

interface Polling {
  scan: ScanDetail | null;
  error: BrowserApiError | null;
  /** Replace the scan locally (after a retry starts) and poll again. */
  restart: (next?: ScanDetail) => void;
}

/**
 * Keeps a scan fresh until it finishes. A finished scan is not polled. Leaving the page stops the
 * poll; the scan keeps processing on the server and opens again from History.
 */
export function useScanPolling(scanId: string | null, initial: ScanDetail | null): Polling {
  const [scan, setScan] = useState<ScanDetail | null>(initial);
  const [error, setError] = useState<BrowserApiError | null>(null);
  const [run, setRun] = useState(0);
  const latest = useRef(scan);
  latest.current = scan;

  useEffect(() => {
    if (!scanId) return;
    if (latest.current && isTerminal(latest.current)) return;
    const controller = new AbortController();
    setError(null);
    void pollScan({
      id: scanId,
      fetchScan: (id, signal) => fetchScan(id, signal),
      signal: controller.signal,
      onUpdate: setScan,
      onError: setError,
    });
    return () => controller.abort();
  }, [scanId, run]);

  const restart = useCallback((next?: ScanDetail) => {
    if (next) setScan(next);
    setError(null);
    setRun((value) => value + 1);
  }, []);

  return { scan, error, restart };
}
