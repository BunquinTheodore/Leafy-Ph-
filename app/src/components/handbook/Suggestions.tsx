import type { SearchEntry } from "@/lib/handbook/search";
import { CompactCard } from "./CompactCard";

/** A short row of related cards under an empty state, so the next step is one tap away. */
export function Suggestions({
  entries,
  label,
}: {
  entries: readonly SearchEntry[];
  label: string;
}) {
  if (entries.length === 0) return null;
  return (
    <ul className="rail-grid suggest m-0 list-none p-0" data-variant="compact" aria-label={label}>
      {entries.map((entry) => (
        <li key={entry.href} className="min-w-0">
          <CompactCard entry={entry} />
        </li>
      ))}
    </ul>
  );
}
