import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ScanDetailView } from "@/components/scan/ScanDetailView";
import { apiFetch } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/current-user";
import { loadLabelOptionsOrNull } from "@/lib/scans/labels-server";
import { parseScanDetail } from "@/lib/scans/types";

export const metadata: Metadata = { title: "Scan result" };
export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

export default async function ScanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) notFound();
  await requireUser();

  let raw: unknown;
  try {
    raw = await apiFetch(`/scans/${parsedId.data}`, { next: `/scans/${parsedId.data}` });
  } catch (error) {
    if (isApiError(error) && error.status === 404) notFound();
    throw error;
  }
  const scan = parseScanDetail(raw);
  if (!scan) throw new Error("The scan reply was not in the expected shape.");
  const labels = await loadLabelOptionsOrNull();
  return <ScanDetailView initial={scan} labels={labels} />;
}
