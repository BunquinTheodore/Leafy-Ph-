import type { SceneColors } from "../three/hooks";

/** "brand" is the plain green leaf; the rest follow the disease severity scale. */
export type AccentTone = "brand" | "low" | "moderate" | "high" | "severe";

export interface AccentPalette {
  base: string;
  vein: string;
  glow: string;
}

const SEVERITY_PALETTES: Record<Exclude<AccentTone, "brand">, AccentPalette> = {
  low: { base: "#3f7a2a", vein: "#e4f5c4", glow: "#a3d65c" },
  moderate: { base: "#8a5a00", vein: "#fff0c2", glow: "#ffb300" },
  high: { base: "#9a3f12", vein: "#ffe1d2", glow: "#ff7a3d" },
  severe: { base: "#8f1f20", vein: "#ffd9d9", glow: "#ff4d4f" },
};

export function accentPalette(tone: AccentTone, colors: SceneColors): AccentPalette {
  if (tone !== "brand") return SEVERITY_PALETTES[tone];
  return colors.dark
    ? { base: colors.deep, vein: colors.glow, glow: colors.brand }
    : { base: colors.brand, vein: "#e6f7e9", glow: colors.glow };
}
