import type { Metadata } from "next";
import { HistoryView } from "@/components/scan/HistoryView";
import { apiFetch } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/current-user";
import { buildListQuery } from "@/lib/scans/api";
import { loadLabelOptionsOrNull } from "@/lib/scans/labels-server";
import { parseScanPage } from "@/lib/scans/types";

export const metadata: Metadata = { title: "Scan history" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 12;

/** API failures become an empty slot so the page still renders; control flow errors rethrow. */
async function attempt(path: string): Promise<unknown> {
  try {
    return await apiFetch(path, { next: "/scans" });
  } catch (error) {
    if (isApiError(error)) return null;
    throw error;
  }
}

export default async function ScansPage() {
  await requireUser();
  const [raw, labels] = await Promise.all([
    attempt(`/scans?${buildListQuery({ limit: PAGE_SIZE })}`),
    loadLabelOptionsOrNull(),
  ]);
  const plants = labels?.plants.map(({ slug, name }) => ({ slug, name })) ?? [];
  return <HistoryView initial={raw === null ? null : parseScanPage(raw)} plants={plants} />;
}
