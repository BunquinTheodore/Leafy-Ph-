/** English strings for v1, kept in one dictionary so Filipino can be added later. */
export const en = {
  nav: {
    handbook: "Handbook",
    signIn: "Sign in",
    home: "Leafy home",
    primary: "Primary",
  },
  hero: {
    eyebrow: "A plant doctor in your pocket",
    title: "Know your leaf.",
    support: "Snap a leaf, understand the disease, know what to do next.",
    primaryCta: "Scan a leaf",
    secondaryCta: "Browse the handbook",
  },
} as const;

export type Copy = typeof en;
