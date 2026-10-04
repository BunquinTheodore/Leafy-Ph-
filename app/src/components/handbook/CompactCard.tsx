import { Leaf, Sprout } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { plantPhotoSrc } from "@/lib/handbook/photos";
import type { SearchEntry } from "@/lib/handbook/search";
import { TiltCard } from "../interaction/Surfaces";
import { SeverityBadge } from "./SeverityBadge";

/** One row card for a disease, or for a plant inside search results. */
export function CompactCard({ entry }: { entry: SearchEntry }) {
  const isPlant = entry.kind === "plant";
  const src = isPlant ? plantPhotoSrc(entry.slug) : null;
  return (
    <TiltCard className="ccard" hint="Open">
      <Link href={entry.href} className="ccard__link" data-pointer-surface>
        {isPlant ? (
          <span className="ccard__thumb duotone">
            {src ? (
              <Image src={src} alt="" fill sizes="44px" />
            ) : (
              <span className="duotone__empty" aria-hidden="true">
                <Sprout size={20} strokeWidth={1.5} />
              </span>
            )}
          </span>
        ) : (
          <span className="ccard__icon" aria-hidden="true">
            <Leaf size={22} strokeWidth={1.5} />
          </span>
        )}
        <span className="ccard__text">
          <span className="ccard__title title-line">{entry.title}</span>
          <span className="ccard__sub">
            {isPlant ? (
              <>
                <span>Plant</span>
                <span>
                  {entry.diseaseCount === 0
                    ? "No diseases catalogued yet"
                    : `${entry.diseaseCount} ${entry.diseaseCount === 1 ? "disease" : "diseases"}`}
                </span>
              </>
            ) : (
              <>
                <span>{entry.subtitle}</span>
                {entry.pathogenType ? <span className="chip">{entry.pathogenType}</span> : null}
                <SeverityBadge severity={entry.severity} withPrefix={false} />
              </>
            )}
          </span>
        </span>
      </Link>
    </TiltCard>
  );
}
