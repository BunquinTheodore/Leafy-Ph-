"use client";

import { ImageOff } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

const ZOOM = 2.5;
/** Matches `.lens` in handbook.css. */
const LENS_SIZE = 150;

interface LensState {
  x: number;
  y: number;
  /** CSS `background-size` and `background-position` of the magnified copy. */
  size: string;
  position: string;
}

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The magnified copy behind the lens. The photo is drawn with `object-fit: cover`, so it is scaled by
 * the larger of the two ratios and centered in its frame; the lens shows that same picture at ZOOM
 * times, with the point under the cursor in the middle of the lens. Returns null outside the frame.
 */
export function lensBackground(
  frame: Box,
  natural: { width: number; height: number },
  point: { x: number; y: number },
): { size: string; position: string } | null {
  if (!frame.width || !frame.height || !natural.width || !natural.height) return null;
  const inside =
    point.x >= frame.left &&
    point.x <= frame.left + frame.width &&
    point.y >= frame.top &&
    point.y <= frame.top + frame.height;
  if (!inside) return null;
  const scale = Math.max(frame.width / natural.width, frame.height / natural.height);
  const width = natural.width * scale;
  const height = natural.height * scale;
  const onPhotoX = point.x - frame.left + (width - frame.width) / 2;
  const onPhotoY = point.y - frame.top + (height - frame.height) / 2;
  return {
    size: `${width * ZOOM}px ${height * ZOOM}px`,
    position: `${LENS_SIZE / 2 - onPhotoX * ZOOM}px ${LENS_SIZE / 2 - onPhotoY * ZOOM}px`,
  };
}

const withSource = (list: readonly string[], src: string): readonly string[] =>
  list.includes(src) ? list : [...list, src];

export interface PhotoSource {
  src: string;
  alt: string;
  caption?: string;
  /** Link to the original photo page, shown as "Source" beside the caption. */
  sourceUrl?: string;
}

/**
 * Reference photo in a neutral frame (natural colors, never tinted) with a magnifier lens that
 * follows a real mouse so small symptoms can be inspected. Touch and keyboard see the plain image.
 * When the photo cannot be loaded, the `fallback` photo (with its own credit) is shown instead, or a
 * quiet icon inside the same frame, never broken image text.
 */
export function MagnifierImage({
  src: primarySrc,
  alt: primaryAlt,
  caption: primaryCaption,
  sourceUrl: primarySourceUrl,
  fallback,
}: PhotoSource & {
  /** Shown if the primary photo fails to load. */
  fallback?: PhotoSource;
}) {
  const [lens, setLens] = useState<LensState | null>(null);
  /** Sources that could not be loaded. The first source not listed here is the one shown. */
  const [broken, setBroken] = useState<readonly string[]>([]);
  const image = useRef<HTMLImageElement>(null);

  const primary: PhotoSource = {
    src: primarySrc,
    alt: primaryAlt,
    caption: primaryCaption,
    sourceUrl: primarySourceUrl,
  };
  const shown = [primary, fallback].find((photo) => photo && !broken.includes(photo.src)) ?? null;
  const shownSrc = shown?.src;
  const caption = shown ? shown.caption : primaryCaption;
  const sourceUrl = shown?.sourceUrl;

  // The error can fire before hydration attaches onError, so check an already broken image too.
  useEffect(() => {
    const node = image.current;
    if (shownSrc && node && node.complete && node.naturalWidth === 0 && node.currentSrc !== "")
      setBroken((list) => withSource(list, shownSrc));
  }, [shownSrc]);

  const move = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType !== "mouse") return;
    const node = image.current;
    const frame = event.currentTarget.querySelector(".shot__frame");
    if (!node || !frame) return;
    const background = lensBackground(
      frame.getBoundingClientRect(),
      { width: node.naturalWidth, height: node.naturalHeight },
      { x: event.clientX, y: event.clientY },
    );
    if (!background) {
      setLens(null);
      return;
    }
    const figure = event.currentTarget.getBoundingClientRect();
    setLens({ x: event.clientX - figure.left, y: event.clientY - figure.top, ...background });
  };

  return (
    <figure className="shot" onPointerMove={move} onPointerLeave={() => setLens(null)}>
      <span className="shot__frame">
        {shown ? (
          // Plain img: catalog photos come from object storage, not the Next optimizer.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={shown.src}
            ref={image}
            src={shown.src}
            alt={shown.alt}
            loading="lazy"
            decoding="async"
            onError={() => setBroken((list) => withSource(list, shown.src))}
          />
        ) : (
          <span className="shot__missing" role="img" aria-label={primaryAlt}>
            <ImageOff size={40} strokeWidth={1.5} aria-hidden="true" />
          </span>
        )}
      </span>
      {lens && shown ? (
        <span
          className="lens"
          data-testid="lens"
          aria-hidden="true"
          style={{
            left: lens.x,
            top: lens.y,
            backgroundImage: `url("${shown.src}")`,
            backgroundSize: lens.size,
            backgroundPosition: lens.position,
          }}
        />
      ) : null}
      {caption ? (
        <figcaption>
          {caption}
          {sourceUrl ? (
            <>
              {" "}
              <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="vein-link">
                Source
              </a>
            </>
          ) : null}
        </figcaption>
      ) : null}
    </figure>
  );
}
