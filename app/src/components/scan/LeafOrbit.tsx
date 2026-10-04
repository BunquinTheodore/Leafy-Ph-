"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import { scanCopy } from "@/lib/i18n/scan-en";
import { severityLevel } from "@/lib/handbook/severity";
import type { ScanDetail } from "@/lib/scans/types";
import { useMediaQuery } from "../interaction/hooks";
import { useReducedMotion, useWebGLSupport } from "../three/hooks";
import { ScanImage } from "./ScanImage";

const LeafOrbitCanvas = dynamic(() => import("../three/scan/LeafOrbitCanvas"), { ssr: false });

const copy = scanCopy.result;

const SEVERITY_COLORS = {
  low: "#a3d65c",
  moderate: "#ffb300",
  high: "#ff7a3d",
  severe: "#ff4d4f",
} as const;
const HEALTHY_COLOR = "#40c057";
const NEUTRAL_COLOR = "#5cc8d0";

/** Marker color follows the severity scale; the badge beside it always carries a label as well. */
export function markerColorFor(scan: Pick<ScanDetail, "verdict" | "disease">): string {
  if (scan.verdict === "healthy") return HEALTHY_COLOR;
  const level = severityLevel(scan.disease?.severity);
  return level ? SEVERITY_COLORS[level] : NEUTRAL_COLOR;
}

/**
 * The user's photo. The flat image is always there (and is the whole view without WebGL or with
 * reduced motion); an orbitable 3D card with a finding marker fades in over it once it is ready.
 */
export function LeafOrbit({ scan }: { scan: ScanDetail }) {
  const supported = useWebGLSupport();
  const reduced = useReducedMotion();
  const coarse = useMediaQuery("(pointer: coarse)");
  const [url, setUrl] = useState(scan.image_url);
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);

  const flat = (
    <ScanImage
      scanId={scan.id}
      src={url}
      alt={copy.photoAlt}
      className="orbit__img"
      onRefreshed={setUrl}
    />
  );
  const showCanvas = supported === true && !reduced && Boolean(url);

  return (
    <figure className="orbit" data-ready={showCanvas && ready} data-no-drag>
      <div className="orbit__flat">{flat}</div>
      {showCanvas && url ? (
        <div className="orbit__stage" role="img" aria-label={copy.orbitLabel}>
          <LeafOrbitCanvas
            photoUrl={url}
            scanId={scan.id}
            markerColor={markerColorFor(scan)}
            coarsePointer={coarse}
            showMarker={scan.verdict === "disease"}
            fallback={null}
            onReady={onReady}
          />
        </div>
      ) : null}
      <figcaption className="orbit__caption">{copy.orbitCaption}</figcaption>
    </figure>
  );
}
