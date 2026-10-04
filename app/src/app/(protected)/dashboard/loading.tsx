import "@/components/dashboard/dashboard.css";
import { Skeleton } from "@/components/ui/Display";

/** Skeleton with the same grid as the dashboard so nothing jumps when data arrives. */
export default function DashboardLoading() {
  return (
    <div className="dash stage-fill" aria-busy="true" aria-label="Loading your dashboard">
      <div className="dash__head">
        <div className="dash__titles">
          <Skeleton style={{ height: 14, width: 160 }} />
          <Skeleton style={{ height: 40, width: 260 }} />
        </div>
      </div>
      <div className="dash__sections">
        <div className="dash__sec dash__sec--overview">
          <div className="dash__tiles">
            <Skeleton style={{ height: 96 }} />
            <Skeleton style={{ height: 96 }} />
          </div>
          <Skeleton style={{ flex: 1, minHeight: 160 }} />
        </div>
        <div className="dash__sec dash__sec--diseases">
          <Skeleton style={{ flex: 1, minHeight: 160 }} />
        </div>
        <div className="dash__sec dash__sec--recent">
          <Skeleton style={{ height: 140 }} />
        </div>
      </div>
    </div>
  );
}
