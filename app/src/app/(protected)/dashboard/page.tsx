import type { Metadata } from "next";
import { DashboardView } from "@/components/dashboard/DashboardView";
import {
  normalizeScanList,
  normalizeStats,
  type DashboardStats,
  type ScanSummary,
} from "@/components/dashboard/data";
import { apiFetch } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/current-user";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const RECENT_LIMIT = 8;
const RETURN_TO = "/dashboard";

/** API failures become an empty slot (so the page still renders); control flow errors rethrow. */
async function attempt(path: string): Promise<unknown> {
  try {
    return await apiFetch(path, { next: RETURN_TO });
  } catch (error) {
    if (isApiError(error)) return null;
    throw error;
  }
}

async function loadDashboard(): Promise<{ stats: DashboardStats | null; scans: ScanSummary[] }> {
  const [rawStats, rawScans] = await Promise.all([
    attempt("/scans/stats"),
    attempt(`/scans?limit=${RECENT_LIMIT}`),
  ]);
  return { stats: normalizeStats(rawStats), scans: normalizeScanList(rawScans) };
}

export default async function DashboardPage() {
  const user = await requireUser();
  const { stats, scans } = await loadDashboard();
  return <DashboardView firstName={user.first_name} stats={stats} scans={scans} />;
}
