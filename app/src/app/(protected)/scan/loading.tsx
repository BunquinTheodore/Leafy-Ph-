import "@/components/scan/scan.css";
import { Skeleton } from "@/components/ui/Display";

export default function ScanLoading() {
  return (
    <div
      className="scan stage-fill wide-stage"
      data-width="standard"
      aria-busy="true"
      aria-label="Loading the scan page"
    >
      <div className="wide-container split split--top scan__split">
        <div className="scan__intro">
          <Skeleton style={{ height: 14, width: 80 }} />
          <Skeleton style={{ height: 40, width: 280 }} />
          <Skeleton style={{ height: 120 }} />
        </div>
        <div className="scan__main">
          <Skeleton style={{ display: "block", height: "calc(420px * var(--ui-scale))" }} />
        </div>
      </div>
    </div>
  );
}
