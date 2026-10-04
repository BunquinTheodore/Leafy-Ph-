import "@/components/scan/scan.css";
import { Skeleton } from "@/components/ui/Display";

export default function ScanLoading() {
  return (
    <div className="scan stage-fill" aria-busy="true" aria-label="Loading the scan page">
      <div className="scan__intro">
        <Skeleton style={{ height: 14, width: 80 }} />
        <Skeleton style={{ height: 40, width: 280 }} />
        <Skeleton style={{ height: 120 }} />
      </div>
      <div className="scan__main">
        <Skeleton style={{ height: "100%", minHeight: 240 }} />
      </div>
    </div>
  );
}
