import mark from "./mark.json";
import wordmark from "./wordmark.json";

const HORIZONTAL = { cap: 46, gap: 30 } as const;
const STACKED = { cap: 30, gap: 28 } as const;

type Tone = "auto" | "mono";

interface BaseProps {
  /** Rendered height in px (width follows the aspect ratio). */
  height?: number;
  /** "auto" follows the theme tokens; "mono" paints everything with currentColor. */
  tone?: Tone;
  className?: string;
  title?: string;
}

const toneClass = (tone: Tone | undefined, className?: string) =>
  [tone === "mono" ? "logo-mono" : "", className ?? ""].filter(Boolean).join(" ") || undefined;

function Mark({ tx = 0 }: { tx?: number }) {
  return (
    <g transform={tx ? `translate(${tx} 0)` : undefined}>
      <path className="logo-big" d={mark.big} />
      <path className="logo-small" d={mark.small} />
    </g>
  );
}

/** The two leaf mark. Same paths feed the SVG files in public/brand and the 3D extrusion. */
export function LogoMark({ height = 32, tone, className, title = "Leafy" }: BaseProps) {
  return (
    <svg
      role="img"
      aria-label={title}
      viewBox={mark.viewBox}
      height={height}
      width={(height * mark.width) / mark.height}
      className={toneClass(tone, className)}
    >
      <Mark />
    </svg>
  );
}

/** LEAFY in Josefin Sans Light caps, outlined so it renders identically everywhere. */
export function Wordmark({ height = 20, tone, className, title = "Leafy" }: BaseProps) {
  return (
    <svg
      role="img"
      aria-label={title}
      viewBox={`0 0 ${wordmark.width} ${wordmark.height}`}
      height={height}
      width={(height * wordmark.width) / wordmark.height}
      className={toneClass(tone, className)}
    >
      <path className="logo-word" d={wordmark.d} />
    </svg>
  );
}

/** Horizontal (mark + wordmark) or stacked lockup. Minimum sizes: 20px mark, 96px lockup. */
export function Logo({
  variant = "horizontal",
  height = 32,
  tone,
  className,
  title = "Leafy",
}: BaseProps & { variant?: "horizontal" | "stacked" }) {
  if (variant === "stacked") {
    const scale = STACKED.cap / wordmark.height;
    const wordWidth = wordmark.width * scale;
    const width = Math.max(mark.width, wordWidth);
    const total = mark.height + STACKED.gap + STACKED.cap;
    return (
      <svg
        role="img"
        aria-label={title}
        viewBox={`0 0 ${width} ${total}`}
        height={height}
        width={(height * width) / total}
        className={toneClass(tone, className)}
      >
        <Mark tx={(width - mark.width) / 2} />
        <path
          className="logo-word"
          transform={`translate(${(width - wordWidth) / 2} ${mark.height + STACKED.gap}) scale(${scale})`}
          d={wordmark.d}
        />
      </svg>
    );
  }

  const scale = HORIZONTAL.cap / wordmark.height;
  const width = mark.width + HORIZONTAL.gap + wordmark.width * scale;
  return (
    <svg
      role="img"
      aria-label={title}
      viewBox={`0 0 ${width} ${mark.height}`}
      height={height}
      width={(height * width) / mark.height}
      className={toneClass(tone, className)}
    >
      <Mark />
      <path
        className="logo-word"
        transform={`translate(${mark.width + HORIZONTAL.gap} ${(mark.height - HORIZONTAL.cap) / 2}) scale(${scale})`}
        d={wordmark.d}
      />
    </svg>
  );
}
