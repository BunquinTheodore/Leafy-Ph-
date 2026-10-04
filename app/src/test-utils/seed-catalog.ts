import type { CatalogSource } from "@/lib/handbook/catalog";
import type { DiseaseSummary, PlantSummary } from "@/lib/handbook/types";
import type { SeedData } from "./seed-data";

/** Test only. Builds the same DTOs the API returns from the committed seed JSON. */
const byPosition = <T extends { position: number }>(items: T[]): T[] =>
  [...items].sort((a, b) => a.position - b.position);

export function createSeedCatalog(data: SeedData): CatalogSource {
  const diseaseSummaries: DiseaseSummary[] = byPosition(data.rawDiseases).map((disease) => ({
    slug: disease.slug,
    plant_slug: disease.plant,
    plant_name: data.rawPlants.find((plant) => plant.slug === disease.plant)?.name ?? disease.plant,
    name: disease.name,
    display_name: disease.display_name,
    pathogen_type: disease.pathogen_type,
    severity: disease.severity,
  }));

  const plantSummaries: PlantSummary[] = data.rawPlants.map((plant) => ({
    slug: plant.slug,
    name: plant.name,
    scientific_name: plant.scientific_name,
    family: plant.family,
    plant_type: plant.type,
    image_url: null,
    image_alt: plant.photo_alt,
    disease_count: diseaseSummaries.filter((disease) => disease.plant_slug === plant.slug).length,
  }));

  const entries = (plant: string, disease: string, kind: string): string[] =>
    byPosition(
      data.rawEntries.filter(
        (entry) => entry.plant === plant && entry.disease === disease && entry.kind === kind,
      ),
    ).map((entry) => entry.text);

  return {
    plants: async () => plantSummaries,
    diseases: async () => diseaseSummaries,
    plant: async (slug) => {
      const raw = data.rawPlants.find((plant) => plant.slug === slug);
      const summary = plantSummaries.find((plant) => plant.slug === slug);
      if (!raw || !summary) return null;
      return {
        ...summary,
        soil_type: raw.soil_type,
        light: raw.light,
        water_needs: raw.water_needs,
        temperature: raw.temperature,
        diseases: diseaseSummaries.filter((disease) => disease.plant_slug === slug),
      };
    },
    disease: async (plantSlug, slug) => {
      const raw = data.rawDiseases.find((item) => item.plant === plantSlug && item.slug === slug);
      const plant = data.rawPlants.find((item) => item.slug === plantSlug);
      if (!raw || !plant) return null;
      return {
        slug: raw.slug,
        name: raw.name,
        display_name: raw.display_name,
        plant: { slug: plant.slug, name: plant.name },
        cause: raw.cause,
        pathogen_type: raw.pathogen_type,
        pathogen_name: raw.pathogen_name,
        severity: raw.severity,
        symptoms: entries(plantSlug, slug, "symptom"),
        treatments: entries(plantSlug, slug, "treatment"),
        preventions: entries(plantSlug, slug, "prevention"),
        affected_species: byPosition(
          data.rawSpecies.filter((item) => item.plant === plantSlug && item.disease === slug),
        ).map((item) => item.species),
        images: [],
      };
    },
  };
}
