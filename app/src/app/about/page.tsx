import type { Metadata } from "next";
import { JsonLd } from "@/components/layout/JsonLd";
import { DocumentPage } from "@/components/legal/DocumentPage";
import { aboutSections } from "@/components/legal/content/about";
import { BRAND_POSITIONING } from "@/lib/brand";
import { aboutJsonLd } from "@/lib/seo/jsonld";
import { pageMetadata } from "@/lib/seo/metadata";
import { siteOrigin } from "@/lib/seo/origin";

export const metadata: Metadata = pageMetadata({
  title: "About",
  description: `${BRAND_POSITIONING} What Leafy is, how it works, who builds it and where the name comes from.`,
  path: "/about",
});

export default function AboutPage() {
  return (
    <>
      <JsonLd data={aboutJsonLd(siteOrigin())} />
      <DocumentPage
        label="About Leafy sections"
        eyebrow="Our story"
        title="About Leafy"
        sections={aboutSections}
        decorate
      />
    </>
  );
}
