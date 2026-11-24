import { Skeleton } from "@/components/ui/Display";

export default function HandbookLoading() {
  return (
    <div className="hb" data-layout="catalog" aria-busy="true" aria-label="Loading the handbook">
      <div className="hb__head">
        <div className="hb__titles">
          <Skeleton style={{ height: 14, width: 120 }} />
          <Skeleton style={{ height: 40, width: "min(24rem, 80%)" }} />
        </div>
      </div>
      <div className="rail-grid hb__skeleton">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} style={{ width: "100%", height: "100%" }} />
        ))}
      </div>
    </div>
  );
}
