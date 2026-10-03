import Image from "next/image";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

const cx = (...parts: Array<string | false | undefined>) => parts.filter(Boolean).join(" ");

/** Card that tilts toward the cursor (max about 6 degrees) with a light glare. CSS only, driven by --px/--py. */
export function TiltCard({
  children,
  className,
  hint,
}: {
  children: ReactNode;
  className?: string;
  /** Short action label revealed on hover and focus, e.g. "Open". */
  hint?: string;
}) {
  return (
    <div className={cx("tilt tilt-glare group", className)} data-pointer-surface>
      {children}
      {hint ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-3 right-4 font-[family-name:var(--font-heading)] text-sm text-[var(--brand-glow)] opacity-0 transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100"
        >
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/** A soft radial spotlight follows the pointer over this surface. */
export function SpotlightSurface({
  children,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article" | "aside";
}) {
  return (
    <Tag className={cx("spotlight", className)} data-pointer-surface>
      {children}
    </Tag>
  );
}

type ImageProps = Pick<ComponentProps<typeof Image>, "src" | "alt" | "sizes" | "priority">;

/** Image with a slow zoom and parallax shift against the cursor (about 1.04x). */
export function ParallaxImage({
  ratio = "4 / 5",
  className,
  caption,
  sizes = "(min-width: 1024px) 33vw, 100vw",
  src,
  alt,
  priority,
}: ImageProps & { ratio?: string; className?: string; caption?: string }) {
  return (
    <figure
      className={cx("parallax-img m-0 overflow-hidden rounded-[var(--radius-card)]", className)}
      data-pointer-surface
      style={{ aspectRatio: ratio }}
    >
      <Image
        src={src}
        alt={alt}
        priority={priority}
        sizes={sizes}
        fill
        className="object-cover will-change-transform"
      />
      {caption ? (
        <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3 text-sm text-white">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

/** Link whose underline is drawn as a leaf vein from the side the cursor enters. */
export function VeinLink({ className, ...props }: ComponentProps<typeof Link>) {
  return <Link {...props} className={cx("vein-link", className)} data-pointer-surface />;
}
