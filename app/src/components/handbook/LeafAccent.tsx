"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, type CSSProperties } from "react";
import { LogoMark } from "../brand/Logo";
import { useInView } from "../landing/useInView";
import type { AccentTone } from "./accent-tones";
import { useAccentCanvas } from "./HandbookStage";

const AccentView = dynamic(() => import("./AccentView"), { ssr: false });

/**
 * A small rotating leaf. It draws into the page's shared canvas while on screen and is the
 * static leaf mark otherwise (no WebGL, reduced motion, off screen). Decorative only.
 */
export function LeafAccent({
  tone = "brand",
  size,
  className,
}: {
  tone?: AccentTone;
  /** CSS length for the square, e.g. "64px". */
  size?: string;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const { enabled, register } = useAccentCanvas();
  const visible = useInView(host, 0.3);
  const live = enabled && visible;

  useEffect(() => (live ? register() : undefined), [live, register]);

  const style = size ? ({ "--accent-size": size } as CSSProperties) : undefined;
  return (
    <div
      ref={host}
      className={["leaf-accent", className ?? ""].filter(Boolean).join(" ")}
      style={style}
      aria-hidden="true"
    >
      {live ? <AccentView tone={tone} /> : <LogoMark height={40} tone="mono" />}
    </div>
  );
}
