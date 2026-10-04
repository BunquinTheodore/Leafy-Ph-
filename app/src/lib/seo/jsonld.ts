import { BRAND_DESCRIPTION, BRAND_NAME } from "@/lib/brand";

type JsonLd = Record<string, unknown>;
const CONTEXT = "https://schema.org";

export function websiteJsonLd(origin: string): JsonLd {
  return {
    "@context": CONTEXT,
    "@type": "WebSite",
    name: BRAND_NAME,
    url: origin,
    description: BRAND_DESCRIPTION,
    inLanguage: "en",
  };
}

export function organizationJsonLd(origin: string): JsonLd {
  return {
    "@context": CONTEXT,
    "@type": "Organization",
    name: BRAND_NAME,
    url: origin,
    logo: `${origin}/icons/icon-512.png`,
  };
}

export function aboutJsonLd(origin: string): JsonLd {
  return {
    "@context": CONTEXT,
    "@type": "AboutPage",
    name: `About ${BRAND_NAME}`,
    url: `${origin}/about`,
    description: BRAND_DESCRIPTION,
    inLanguage: "en",
    isPartOf: { "@type": "WebSite", name: BRAND_NAME, url: origin },
    about: { "@type": "Organization", name: BRAND_NAME, url: origin },
  };
}

export interface FaqEntry {
  question: string;
  answer: string;
}

export function faqPageJsonLd(items: readonly FaqEntry[]): JsonLd {
  return {
    "@context": CONTEXT,
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

/** JSON for a `<script type="application/ld+json">`: "<" is escaped so data can never end the tag. */
export function serializeJsonLd(data: JsonLd): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
