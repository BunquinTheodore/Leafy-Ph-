import type { Metadata } from "next";
import { BRAND_NAME } from "@/lib/brand";

export const SHARE_IMAGE = {
  url: "/og/og-image.png",
  width: 1200,
  height: 630,
  alt: "Leafy, know your leaf",
} as const;

const MAX_DESCRIPTION_LENGTH = 160;

interface PageMetadataInput {
  /** Page title without the brand; the root layout template adds "| Leafy". */
  title: string;
  description: string;
  /** Path on this site, such as "/about". Next resolves it against metadataBase. */
  path: string;
  noindex?: boolean;
  type?: "website" | "article";
}

/**
 * Per page metadata: canonical, Open Graph and Twitter. A page level `openGraph` replaces the
 * root one rather than merging, so the share image is repeated here.
 */
export function pageMetadata({
  title,
  description,
  path,
  noindex = false,
  type = "website",
}: PageMetadataInput): Metadata {
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new Error(`description for ${path} is over ${MAX_DESCRIPTION_LENGTH} characters`);
  }
  const fullTitle = `${title} | ${BRAND_NAME}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    ...(noindex ? { robots: { index: false, follow: false } } : {}),
    openGraph: {
      type,
      url: path,
      siteName: BRAND_NAME,
      title: fullTitle,
      description,
      images: [{ ...SHARE_IMAGE }],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: [SHARE_IMAGE.url],
    },
  };
}
