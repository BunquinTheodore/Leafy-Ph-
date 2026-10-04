import { Skeleton } from "@/components/ui/Display";

export default function HandbookLoading() {
  return (
    <div className="hb" aria-busy="true" aria-label="Loading the handbook">
      <div className="hb__head">
        <div className="hb__titles">
          <Skeleton style={{ height: 14, width: 120 }} />
          <Skeleton style={{ height: 40, width: "min(24rem, 80%)" }} />
        </div>
      </div>
      <div className="rail-grid px-[var(--gutter)] py-3">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} style={{ aspectRatio: "4 / 5", width: "100%" }} />
        ))}
      </div>
    </div>
  );
}
