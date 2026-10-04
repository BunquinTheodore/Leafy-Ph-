/** Plants with their diseases, for the optional "What is it really?" picker. */
export interface LabelDisease {
  slug: string;
  name: string;
}

export interface LabelPlant {
  slug: string;
  name: string;
  diseases: LabelDisease[];
}

export interface LabelOptions {
  plants: LabelPlant[];
}

interface PlantInput {
  slug: string;
  name: string;
}

interface DiseaseInput {
  slug: string;
  plant_slug: string;
  display_name: string;
  name: string;
}

/** Groups diseases under their plant and sorts both by name. */
export function buildLabelOptions(
  plants: readonly PlantInput[],
  diseases: readonly DiseaseInput[],
): LabelOptions {
  const byPlant = new Map<string, LabelDisease[]>();
  for (const disease of diseases) {
    const list = byPlant.get(disease.plant_slug) ?? [];
    list.push({ slug: disease.slug, name: disease.display_name || disease.name });
    byPlant.set(disease.plant_slug, list);
  }
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  return {
    plants: plants
      .map((plant) => ({
        slug: plant.slug,
        name: plant.name,
        diseases: [...(byPlant.get(plant.slug) ?? [])].sort(byName),
      }))
      .sort(byName),
  };
}

export function findPlantName(options: LabelOptions | null, slug: string | null): string | null {
  if (!options || !slug) return null;
  return options.plants.find((plant) => plant.slug === slug)?.name ?? null;
}
