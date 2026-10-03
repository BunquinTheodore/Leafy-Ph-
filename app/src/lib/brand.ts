/** Single source for brand strings. Copy lives here so Filipino can be added later. */
export const BRAND_NAME = "Leafy";
export const BRAND_WORDMARK = "LEAFY";
export const BRAND_ORIGIN_NOTE = "Dahon means leaf in Filipino.";
export const BRAND_POSITIONING = "A plant doctor in your pocket.";

export const TAGLINES = [
  "Know your leaf.",
  "Read the leaf. Save the plant.",
  "Plant health, understood.",
] as const;

export const BRAND_TAGLINE = TAGLINES[0];
export const BRAND_DESCRIPTION = "Snap a leaf, understand the disease, know what to do next.";

/** Brand greens (mirrors tokens.css; the SVG assets and the cursor use BRAND_GREEN). */
export const BRAND_GREEN = "#40c057";
export const BRAND_GREEN_DEEP = "#1f6b3a";
