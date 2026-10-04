"use client";

import { useRouter } from "next/navigation";
import type { LabelOptions } from "@/lib/scans/labels";
import type { ScanDetail } from "@/lib/scans/types";
import { ScanTracker } from "./ScanTracker";
import "./scan.css";

/** /scans/[id]: the same panels as the result. A scan still running resumes its progress here. */
export function ScanDetailView({
  initial,
  labels,
}: {
  initial: ScanDetail;
  labels: LabelOptions | null;
}) {
  const router = useRouter();
  const created = Date.parse(initial.created_at);
  return (
    <div className="scan scan--tracking stage-fill">
      <ScanTracker
        scanId={initial.id}
        initial={initial}
        photoUrl={initial.image_url}
        startedAtMs={Number.isFinite(created) ? created : null}
        labels={labels}
        onDeleted={() => router.push("/scans")}
      />
    </div>
  );
}
