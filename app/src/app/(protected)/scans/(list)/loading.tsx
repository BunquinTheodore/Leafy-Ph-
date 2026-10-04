import "@/components/scan/scan.css";
import { Skeleton } from "@/components/ui/Display";

export default function ScansLoading() {
  return (
    <div className="hist stage-fill" aria-busy="true" aria-label="Loading your scans">
      <div className="hist__head">
        <div className="hist__titles">
          <Skeleton style={{ height: 14, width: 80 }} />
          <Skeleton style={{ height: 40, width: 240 }} />
        </div>
      </div>
      <Skeleton style={{ height: 44, maxWidth: 520 }} />
      <Skeleton style={{ flex: 1, minHeight: 200 }} />
    </div>
  );
}
