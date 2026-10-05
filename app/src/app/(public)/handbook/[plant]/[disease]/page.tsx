import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/handbook/Breadcrumbs";
import { DiseaseView } from "@/components/handbook/DiseaseView";
import { HandbookStage } from "@/components/handbook/HandbookStage";
import { SeverityBadge } from "@/components/handbook/SeverityBadge";
import { LinkButton } from "@/components/ui/Button";
import { getCatalog } from "@/lib/handbook/catalog";
import { guessViewportSize } from "@/lib/handbook/device";
import { handbookCopy } from "@/lib/handbook/copy";
import { breadcrumbJsonLd } from "@/lib/handbook/jsonld";
import { buildSearchIndex } from "@/lib/handbook/search";

interface Params {
  params: Promise<{ plant: string; disease: string }>;
}

async function loadPlant(slug: string) {
  return (await getCatalog()).plant(slug);
}

async function loadDisease(plant: string, disease: string) {
  return (await getCatalog()).disease(plant, disease);
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { plant, disease: slug } = await params;
  const disease = await loadDisease(plant, slug);
  if (!disease) return { title: "Disease not found", robots: { index: false } };
  return {
    title: `${disease.name} on ${disease.plant.name}`,
    description: `Causes, symptoms, treatment and prevention of ${disease.name} on ${disease.plant.name}, in plain words.`,
    alternates: { canonical: `/handbook/${disease.plant.slug}/${disease.slug}` },
  };
}

export default async function DiseasePage({ params }: Params) {
  const { plant, disease: slug } = await params;
  const disease = await loadDisease(plant, slug);
  if (!disease) notFound();
  const siblings = disease.images.length === 0 ? await loadPlant(disease.plant.slug) : null;
  const related = buildSearchIndex(
    [],
    (siblings?.diseases ?? []).filter((other) => other.slug !== disease.slug).slice(0, 3),
  );
  const speciesNames: Record<string, string> = {};
  for (const known of await (await getCatalog()).plants())
    if (known.scientific_name) speciesNames[known.scientific_name.toLowerCase()] = known.name;
  const origin = process.env.APP_ORIGIN ?? "http://localhost:3000";
  const copy = handbookCopy.disease;
  const path = `/handbook/${disease.plant.slug}/${disease.slug}`;
  return (
    <HandbookStage>
      <div className="hb" data-layout="reading">
        <div className="hb__head">
          <div className="hb__titles">
            <Breadcrumbs
              items={[
                { label: "Handbook", href: "/handbook" },
                { label: disease.plant.name, href: `/handbook/${disease.plant.slug}` },
                { label: disease.display_name },
              ]}
            />
            <div className="hb__titlerow">
              <h1 className="display hb__title">{disease.name}</h1>
              <SeverityBadge severity={disease.severity} />
            </div>
          </div>
        </div>
        <DiseaseView
          disease={disease}
          related={related}
          speciesNames={speciesNames}
          initialSize={guessViewportSize(await headers())}
        />
        <div className="hb__cta">
          <p>{copy.ctaQuestion}</p>
          <LinkButton href="/scan" size="sm">
            {copy.ctaAction}
          </LinkButton>
        </div>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: breadcrumbJsonLd(origin, [
              { name: "Handbook", path: "/handbook" },
              { name: disease.plant.name, path: `/handbook/${disease.plant.slug}` },
              { name: disease.display_name, path },
            ]),
          }}
        />
      </div>
    </HandbookStage>
  );
}
