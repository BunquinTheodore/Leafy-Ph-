"use client";

import { ImageOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { scanCopy } from "@/lib/i18n/scan-en";
import { fetchScan } from "@/lib/scans/api";

/** How many times a broken image asks for a fresh link before showing the placeholder. */
const MAX_REFRESHES = 2;

interface ScanImageProps {
  scanId: string;
  src: string | null;
  alt: string;
  className?: string;
  /** Called with the new link after an expired one was refreshed. */
  onRefreshed?: (url: string) => void;
}

/**
 * Scan photos come from private storage with short lived links. A plain img is used on purpose
 * (presigned URLs do not work with the Next optimizer). When the link has expired the browser
 * reports an error; this asks the API for a fresh link and tries again, then gives up politely.
 */
export function ScanImage({ scanId, src, alt, className, onRefreshed }: ScanImageProps) {
  const [url, setUrl] = useState(src);
  const [failed, setFailed] = useState(false);
  const refreshes = useRef(0);

  useEffect(() => {
    setUrl(src);
    setFailed(false);
    refreshes.current = 0;
  }, [src]);

  const refresh = useCallback(async () => {
    if (refreshes.current >= MAX_REFRESHES) {
      setFailed(true);
      return;
    }
    refreshes.current += 1;
    const result = await fetchScan(scanId);
    const next = result.ok ? result.scan.image_url : null;
    if (next && next !== url) {
      setUrl(next);
      onRefreshed?.(next);
    } else {
      setFailed(true);
    }
  }, [onRefreshed, scanId, url]);

  if (!url || failed) {
    return (
      <span
        className={["scan-img scan-img--empty", className ?? ""].join(" ").trim()}
        role="img"
        aria-label={scanCopy.history.photoReferenceSoon}
      >
        <ImageOff size={28} strokeWidth={1.5} aria-hidden="true" />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={["scan-img", className ?? ""].join(" ").trim()}
      src={url}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => void refresh()}
    />
  );
}
