"use client";

import { Droplets, Mountain, Sun, Thermometer, type LucideIcon } from "lucide-react";
import Image from "next/image";
import { useMemo } from "react";
import { handbookCopy } from "@/lib/handbook/copy";
import type { ViewportSize } from "@/lib/handbook/device";
import { plantPhotoSrc } from "@/lib/handbook/photos";
import { buildSearchIndex } from "@/lib/handbook/search";
import type { PlantDetail } from "@/lib/handbook/types";
import { LinkButton } from "../ui/Button";
import { Card, EmptyState } from "../ui/Display";
import { SlidePanels, type Panel } from "../slide-panels/SlidePanels";
import { chunk, usePerPanel } from "./CatalogRail";
import { CompactCard } from "./CompactCard";
import { LeafAccent } from "./LeafAccent";

interface Condition {
  key: keyof Pick<PlantDetail, "soil_type" | "light" | "water_needs" | "temperature">;
  label: string;
  icon: LucideIcon;
}

const copy = handbookCopy.plant;

const CONDITIONS: readonly Condition[] = [
  { key: "soil_type", label: copy.soil, icon: Mountain },
  { key: "light", label: copy.light, icon: Sun },
  { key: "water_needs", label: copy.water, icon: Droplets },
  { key: "temperature", label: copy.temperature, icon: Thermometer },
];

function Overview({ plant }: { plant: PlantDetail }) {
  const src = plantPhotoSrc(plant.slug);
  const shown = CONDITIONS.filter((condition) => plant[condition.key]);
  return (
    <div className="dp">
      <div className="dp__main">
        <h2 className="h2">{copy.growth}</h2>
        {shown.length > 0 ? (
          <ul className="conditions">
            {shown.map(({ key, label, icon: Icon }) => (
              <li key={key}>
                <Card className="condition" vein={false}>
                  <Icon
                    size={22}
                    strokeWidth={1.5}
                    aria-hidden="true"
                    className="condition__icon"
                  />
                  <div>
                    <h3 className="condition__label">{label}</h3>
                    <p className="condition__text">{plant[key]}</p>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          <p className="blurb m-0">Growth details have not been added for this plant yet.</p>
        )}
      </div>
      <div className="dp__aside">
        <div className="duotone plant-photo">
          {src ? (
            <Image
              src={src}
              alt={plant.image_alt ?? `${plant.name} plant`}
              fill
              priority
              sizes="(min-width: 900px) 30vw, 0px"
            />
          ) : null}
          <LeafAccent size="72px" className="plant-photo__accent" />
        </div>
      </div>
    </div>
  );
}

function DiseasePage({
  index,
  plant,
}: {
  index: ReturnType<typeof buildSearchIndex>;
  plant: PlantDetail;
}) {
  return (
    <ul
      className="rail-grid m-0 list-none p-0"
      data-variant="compact"
      aria-label={`${plant.name} diseases`}
    >
      {index.map((entry) => (
        <li key={entry.href} className="min-w-0">
          <CompactCard entry={entry} />
        </li>
      ))}
    </ul>
  );
}

/** Overview first, then the plant's diseases as a row of sideways pages. */
export function PlantPanels({
  plant,
  initialSize = "desktop",
}: {
  plant: PlantDetail;
  initialSize?: ViewportSize;
}) {
  const perPanel = usePerPanel("compact", initialSize);
  const panels = useMemo<Panel[]>(() => {
    const overview: Panel = {
      id: "overview",
      title: copy.overview,
      content: <Overview plant={plant} />,
    };
    if (plant.diseases.length === 0) {
      return [
        overview,
        {
          id: "diseases",
          title: copy.diseases,
          content: (
            <div className="grid h-full place-items-center">
              <EmptyState
                title={copy.noDiseasesTitle}
                action={
                  <LinkButton href="/handbook" variant="secondary">
                    {copy.browseOthers}
                  </LinkButton>
                }
              >
                {copy.noDiseasesBody}
              </EmptyState>
            </div>
          ),
        },
      ];
    }
    const entries = buildSearchIndex([], plant.diseases);
    const pages = chunk(entries, perPanel);
    return [
      overview,
      ...pages.map<Panel>((page, position) => ({
        id: position === 0 ? "diseases" : `diseases-${position + 1}`,
        title: pages.length === 1 ? copy.diseases : `${copy.diseases} ${position + 1}`,
        content: <DiseasePage index={page} plant={plant} />,
      })),
    ];
  }, [perPanel, plant]);

  return (
    <SlidePanels
      key={`${plant.slug}-${perPanel}`}
      label={`${plant.name} handbook`}
      panels={panels}
    />
  );
}
