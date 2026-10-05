import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/handbook/Breadcrumbs";
import { HandbookStage } from "@/components/handbook/HandbookStage";
import { PlantPanels } from "@/components/handbook/PlantPanels";
import { getCatalog } from "@/lib/handbook/catalog";
import { guessViewportSize } from "@/lib/handbook/device";
import { breadcrumbJsonLd } from "@/lib/handbook/jsonld";
import { buildSearchIndex } from "@/lib/handbook/search";

interface Params {
  params: Promise<{ plant: string }>;
}

async function loadPlant(slug: string) {
  return (await getCatalog()).plant(slug);
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { plant: slug } = await params;
  const plant = await loadPlant(slug);
  if (!plant) return { title: "Plant not found", robots: { index: false } };
  const scientific = plant.scientific_name ? ` (${plant.scientific_name})` : "";
  return {
    title: plant.name,
    description: `Growth conditions and common diseases of ${plant.name}${scientific}, in plain words.`,
    alternates: { canonical: `/handbook/${plant.slug}` },
  };
}

export default async function PlantPage({ params }: Params) {
  const { plant: slug } = await params;
  const plant = await loadPlant(slug);
  if (!plant) notFound();
  const otherPlants =
    plant.diseases.length === 0
      ? buildSearchIndex(
          (await (await getCatalog()).plants())
            .filter((other) => other.slug !== plant.slug && other.disease_count > 0)
            .slice(0, 3),
          [],
        )
      : [];
  const origin = process.env.APP_ORIGIN ?? "http://localhost:3000";
  const eyebrow = [plant.family, plant.plant_type].filter(Boolean).join(" · ");
  return (
    <HandbookStage>
      <div className="hb" data-layout="reading">
        <div className="hb__head">
          <div className="hb__titles">
            <Breadcrumbs
              items={[{ label: "Handbook", href: "/handbook" }, { label: plant.name }]}
            />
            {eyebrow ? <p className="eyebrow m-0">{eyebrow}</p> : null}
            <h1 className="display hb__title">{plant.name}</h1>
            {plant.scientific_name ? <p className="hb__sci">{plant.scientific_name}</p> : null}
          </div>
        </div>
        <PlantPanels
          plant={plant}
          otherPlants={otherPlants}
          initialSize={guessViewportSize(await headers())}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: breadcrumbJsonLd(origin, [
              { name: "Handbook", path: "/handbook" },
              { name: plant.name, path: `/handbook/${plant.slug}` },
            ]),
          }}
        />
      </div>
    </HandbookStage>
  );
}
