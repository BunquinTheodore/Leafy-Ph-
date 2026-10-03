"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useEffectsAllowed } from "./hooks";
import { magneticOffset, type MagneticOptions } from "./math";

const DEFAULTS: MagneticOptions = { radius: 90, strength: 0.28, max: 6 };

interface MagneticProps {
  children: ReactNode;
  className?: string;
  options?: Partial<MagneticOptions>;
}

/** Drifts its content a few px toward the pointer when it is close. Transform only, no layout. */
export function Magnetic({ children, className, options }: MagneticProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const allowed = useEffectsAllowed();
  const radius = options?.radius ?? DEFAULTS.radius;
  const strength = options?.strength ?? DEFAULTS.strength;
  const max = options?.max ?? DEFAULTS.max;

  useEffect(() => {
    const element = ref.current;
    if (!allowed || !element) return;
    const config: MagneticOptions = { radius, strength, max };
    let frame = 0;
    let last: PointerEvent | null = null;

    const apply = () => {
      frame = 0;
      if (!last) return;
      const rect = element.getBoundingClientRect();
      const dx = last.clientX - (rect.left + rect.width / 2);
      const dy = last.clientY - (rect.top + rect.height / 2);
      const offset = magneticOffset(dx, dy, {
        ...config,
        radius: config.radius + Math.max(rect.width, rect.height) / 2,
      });
      element.style.transform = `translate3d(${offset.x.toFixed(2)}px, ${offset.y.toFixed(2)}px, 0)`;
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      last = event;
      if (!frame) frame = requestAnimationFrame(apply);
    };

    document.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      document.removeEventListener("pointermove", onMove);
      if (frame) cancelAnimationFrame(frame);
      element.style.transform = "";
    };
  }, [allowed, radius, strength, max]);

  return (
    <span
      ref={ref}
      className={className}
      style={{ display: "inline-flex", transition: "transform 220ms var(--ease)" }}
    >
      {children}
    </span>
  );
}
