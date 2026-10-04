"use client";

import { useState, type PointerEvent as ReactPointerEvent } from "react";

const ZOOM = 2.5;

interface LensState {
  x: number;
  y: number;
  bgX: number;
  bgY: number;
}

/**
 * Reference photo in a neutral frame (natural colors, never tinted) with a magnifier lens that
 * follows a real mouse so small symptoms can be inspected. Touch and keyboard see the plain image.
 */
export function MagnifierImage({
  src,
  alt,
  caption,
}: {
  src: string;
  alt: string;
  caption?: string;
}) {
  const [lens, setLens] = useState<LensState | null>(null);

  const move = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType !== "mouse") return;
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;
    const x = event.clientX - box.left;
    const y = event.clientY - box.top;
    setLens({ x, y, bgX: (x / box.width) * 100, bgY: (y / box.height) * 100 });
  };

  return (
    <figure className="shot" onPointerMove={move} onPointerLeave={() => setLens(null)}>
      {/* Plain img: catalog photos come from object storage, not the Next optimizer. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} loading="lazy" decoding="async" />
      {lens ? (
        <span
          className="lens"
          data-testid="lens"
          aria-hidden="true"
          style={{
            left: lens.x,
            top: lens.y,
            backgroundImage: `url("${src}")`,
            backgroundSize: `${ZOOM * 100}% auto`,
            backgroundPosition: `${lens.bgX}% ${lens.bgY}%`,
          }}
        />
      ) : null}
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}
