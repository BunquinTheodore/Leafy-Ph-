import { Sprout } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { plantPhotoSrc } from "@/lib/handbook/photos";
import type { SearchEntry } from "@/lib/handbook/search";
import { TiltCard } from "../interaction/Surfaces";
import { LeafAccent } from "./LeafAccent";

const diseaseLabel = (count: number) =>
  count === 0 ? "No diseases catalogued yet" : count === 1 ? "1 disease" : `${count} diseases`;

/** Plant card: shared duotone 4:5 photo, one line title, tilt and glare on hover. */
export function PlantCard({ entry, priority = false }: { entry: SearchEntry; priority?: boolean }) {
  const src = plantPhotoSrc(entry.slug);
  return (
    <TiltCard className="pcard" hint="Open">
      <Link href={entry.href} className="pcard__link" data-pointer-surface>
        <span className="duotone">
          {src ? (
            <Image
              src={src}
              alt={entry.imageAlt ?? `${entry.title} plant`}
              fill
              priority={priority}
              sizes="(min-width: 1100px) 24vw, (min-width: 700px) 30vw, 46vw"
            />
          ) : (
            <span className="duotone__empty" aria-hidden="true">
              <Sprout size={40} strokeWidth={1.5} />
            </span>
          )}
        </span>
        <span className="pcard__body">
          <span className="pcard__name title-line">{entry.title}</span>
          <span className="pcard__sci title-line">{entry.subtitle || " "}</span>
          <span className="pcard__meta title-line">{diseaseLabel(entry.diseaseCount)}</span>
        </span>
      </Link>
      <LeafAccent />
    </TiltCard>
  );
}
