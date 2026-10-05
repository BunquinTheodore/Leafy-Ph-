import { Circle, Diamond, Square } from "lucide-react";
import { member } from "@/lib/i18n/member-en";
import { Card } from "../ui/Display";
import { splitSegments, type DashboardStats, type Segment } from "./data";
import { StatOrb } from "./StatOrb";

const copy = member.dashboard;

/** Different shapes as well as colors, so the legend never relies on color alone. */
const SHAPES = { healthy: Circle, diseased: Diamond, unknown: Square } as const;

const percent = (fraction: number) => `${Math.round(fraction * 100)}%`;

function Legend({ segments }: { segments: readonly Segment[] }) {
  return (
    <ul className="rsplit__legend" aria-label={copy.splitTitle}>
      {segments.map((segment) => {
        const Shape = SHAPES[segment.key];
        return (
          <li key={segment.key} className="rsplit__row" data-key={segment.key}>
            <Shape size={14} strokeWidth={2} aria-hidden="true" className="rsplit__shape" />
            <span className="rsplit__name">{segment.label}</span>
            <span className="stat rsplit__count">{segment.count}</span>
            <span className="rsplit__pct">{percent(segment.fraction)}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Healthy, disease and unclear results with a 3D ring and a text legend. */
export function ResultSplit({ stats }: { stats: DashboardStats }) {
  const segments = splitSegments(stats);
  return (
    <Card glass className="rsplit" data-testid="result-split">
      <h2 className="h3 rsplit__title">{copy.splitTitle}</h2>
      <p className="sr-only">{copy.splitLabel(stats.healthy, stats.diseased, stats.unknown)}</p>
      <div className="rsplit__body">
        <StatOrb segments={segments} />
        <Legend segments={segments} />
      </div>
    </Card>
  );
}
