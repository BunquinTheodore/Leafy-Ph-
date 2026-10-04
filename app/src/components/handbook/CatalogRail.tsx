"use client";

import { useMemo } from "react";
import type { SearchEntry } from "@/lib/handbook/search";
import type { ViewportSize } from "@/lib/handbook/device";
import { SlidePanels, type Panel } from "../slide-panels/SlidePanels";
import { CompactCard } from "./CompactCard";
import { PlantCard } from "./PlantCard";
import { useViewportSize } from "./useViewportSize";

export type RailVariant = "plants" | "compact";

/** Items per sideways panel: [desktop, tablet, phone]. Rows times columns of the grid at each width. */
const PER_PANEL: Record<RailVariant, readonly [number, number, number]> = {
  plants: [4, 6, 4],
  compact: [6, 4, 4],
};

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const pages: T[][] = [];
  for (let start = 0; start < items.length; start += size)
    pages.push(items.slice(start, start + size));
  return pages;
}

export function usePerPanel(variant: RailVariant, initialSize: ViewportSize): number {
  const size = useViewportSize(initialSize);
  const [wide, medium, narrow] = PER_PANEL[variant];
  return size === "desktop" ? wide : size === "tablet" ? medium : narrow;
}

/** Cards laid out as sideways panels. Plants and diseases never scroll vertically. */
export function CatalogRail({
  entries,
  variant,
  label,
  idPrefix,
  initialSize,
  syncHash = false,
}: {
  entries: SearchEntry[];
  variant: RailVariant;
  label: string;
  idPrefix: string;
  initialSize: ViewportSize;
  syncHash?: boolean;
}) {
  const perPanel = usePerPanel(variant, initialSize);
  const panels = useMemo<Panel[]>(
    () =>
      chunk(entries, perPanel).map((page, index) => ({
        id: `${idPrefix}-${index + 1}`,
        title: `Page ${index + 1}`,
        content: (
          <ul className="rail-grid m-0 list-none p-0" data-variant={variant}>
            {page.map((entry, position) => (
              <li key={entry.href} className="min-w-0">
                {entry.kind === "plant" && variant === "plants" ? (
                  <PlantCard entry={entry} priority={index === 0 && position < 4} />
                ) : (
                  <CompactCard entry={entry} />
                )}
              </li>
            ))}
          </ul>
        ),
      })),
    [entries, idPrefix, perPanel, variant],
  );

  return (
    <SlidePanels
      key={`${idPrefix}-${perPanel}-${entries.length}`}
      label={label}
      panels={panels}
      syncHash={syncHash}
    />
  );
}
