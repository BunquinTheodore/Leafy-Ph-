"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { callApi } from "@/lib/api/browser";
import { member } from "@/lib/i18n/member-en";
import { isLive, normalizeScanList, type ScanSummary } from "./data";
import { ScanCard } from "./ScanCard";

const copy = member.dashboard;
const POLL_START_MS = 2000;
const POLL_MAX_MS = 5000;
const POLL_STEP_MS = 1000;
const RAIL_LIMIT = 8;

/**
 * Recent scans as a sideways rail (a short list on phones). Scans that are still processing
 * are refreshed in place with a gentle backoff until they finish, so the badge stays live.
 */
export function RecentScans({ initial }: { initial: readonly ScanSummary[] }) {
  const [scans, setScans] = useState<readonly ScanSummary[]>(initial);
  const hasLive = scans.some(isLive);

  useEffect(() => setScans(initial), [initial]);

  useEffect(() => {
    if (!hasLive) return;
    let cancelled = false;
    let delay = POLL_START_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();

    const tick = async () => {
      const result = await callApi<unknown>(`/api/scans?limit=${RAIL_LIMIT}`, {
        signal: controller.signal,
      });
      if (cancelled) return;
      if (result.ok) setScans(normalizeScanList(result.data));
      delay = Math.min(POLL_MAX_MS, delay + POLL_STEP_MS);
      timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, delay);
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [hasLive]);

  return (
    <div className="recent" data-testid="recent-scans">
      <div className="recent__head">
        <h2 className="h3">{copy.recentTitle}</h2>
        <Link href="/scans" className="recent__all pressable">
          {copy.recentAll}
          <ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" />
        </Link>
      </div>
      {scans.length === 0 ? (
        <p className="blurb m-0">{copy.recentEmpty}</p>
      ) : (
        <ul className="recent__rail" data-no-drag>
          {scans.map((scan) => (
            <ScanCard key={scan.id} scan={scan} />
          ))}
        </ul>
      )}
    </div>
  );
}
