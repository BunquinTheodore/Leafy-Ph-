import type { Metadata } from "next";
import { SlidePanels, type Panel } from "@/components/slide-panels/SlidePanels";
import { ScrollGuard } from "@/components/handbook/ScrollGuard";
import { Hero } from "@/components/landing/Hero";
import { faqItems, landingCopy } from "@/components/landing/copy";
import { Faq, FinalCta, HowItWorks, PlantsWeCover, WhyLeafy } from "@/components/landing/Sections";
import { JsonLd } from "@/components/layout/JsonLd";
import { faqPageJsonLd } from "@/lib/seo/jsonld";
import { getCatalog } from "@/lib/handbook/catalog";
import type { PlantSummary } from "@/lib/handbook/types";
import { BRAND_DESCRIPTION, BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";

export const metadata: Metadata = {
  title: { absolute: `${BRAND_NAME} | ${BRAND_TAGLINE}` },
  description: BRAND_DESCRIPTION,
  alternates: { canonical: "/" },
};

interface CatalogGlance {
  plants: PlantSummary[] | null;
  diseaseCount: number;
}

/** The landing page must still render when the API is down, so a failure only empties the plants panel. */
async function readCatalogGlance(): Promise<CatalogGlance> {
  try {
    const catalog = await getCatalog();
    const [plants, diseases] = await Promise.all([catalog.plants(), catalog.diseases()]);
    return { plants, diseaseCount: diseases.length };
  } catch (error) {
    const code = error instanceof Error ? error.name : "unknown";
    console.error(`landing: catalog unavailable (${code})`);
    return { plants: null, diseaseCount: 0 };
  }
}

export default async function LandingPage() {
  const { plants, diseaseCount } = await readCatalogGlance();
  const faq = faqItems((plants ?? []).map((plant) => plant.name));
  const titles = landingCopy.panels;

  const panels: Panel[] = [
    { id: "hero", title: titles.hero, content: <Hero embedded /> },
    { id: "how-it-works", title: titles.how, content: <HowItWorks /> },
    {
      id: "plants",
      title: titles.plants,
      content: <PlantsWeCover plants={plants} diseaseCount={diseaseCount} />,
    },
    { id: "why-leafy", title: titles.why, content: <WhyLeafy /> },
    { id: "faq", title: titles.faq, content: <Faq items={faq} /> },
    { id: "start", title: titles.start, content: <FinalCta /> },
  ];

  return (
    <div className="stage-fill">
      <ScrollGuard />
      <SlidePanels className="lp" label="Leafy introduction" panels={panels} />
      <JsonLd data={faqPageJsonLd(faq)} />
    </div>
  );
}
