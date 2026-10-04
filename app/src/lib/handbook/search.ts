import type { DiseaseSummary, PlantSummary } from "./types";

export interface SearchEntry {
  kind: "plant" | "disease";
  href: string;
  title: string;
  subtitle: string;
  plantSlug: string;
  slug: string;
  /** Normalised title and searchable text. */
  titleKey: string;
  haystack: string;
  /** Present for diseases, used for the badge on result cards. */
  severity: string | null;
  pathogenType: string | null;
  /** Plants only. */
  diseaseCount: number;
  imageAlt: string | null;
}

const MARKS = /[̀-ͯ]/g;

export function normalize(text: string): string {
  return text.normalize("NFD").replace(MARKS, "").toLowerCase().trim();
}

/** "Vaccinium corymbosum (Highbush), Vaccinium ..." reads as "Vaccinium corymbosum" on a card. */
export function firstScientificName(name: string | null): string {
  return name ? (name.split(/[,(]/)[0] ?? "").trim() : "";
}

export function buildSearchIndex(
  plants: readonly PlantSummary[],
  diseases: readonly DiseaseSummary[],
): SearchEntry[] {
  const plantEntries = plants.map<SearchEntry>((plant) => ({
    kind: "plant",
    href: `/handbook/${plant.slug}`,
    title: plant.name,
    subtitle: firstScientificName(plant.scientific_name) || (plant.plant_type ?? ""),
    plantSlug: plant.slug,
    slug: plant.slug,
    titleKey: normalize(plant.name),
    haystack: normalize(
      [plant.name, plant.scientific_name, plant.family, plant.plant_type].filter(Boolean).join(" "),
    ),
    severity: null,
    pathogenType: null,
    diseaseCount: plant.disease_count,
    imageAlt: plant.image_alt,
  }));
  const diseaseEntries = diseases.map<SearchEntry>((disease) => ({
    kind: "disease",
    href: `/handbook/${disease.plant_slug}/${disease.slug}`,
    title: disease.display_name,
    subtitle: disease.plant_name,
    plantSlug: disease.plant_slug,
    slug: disease.slug,
    titleKey: normalize(disease.display_name),
    haystack: normalize(
      [disease.display_name, disease.name, disease.plant_name, disease.pathogen_type]
        .filter(Boolean)
        .join(" "),
    ),
    severity: disease.severity,
    pathogenType: disease.pathogen_type,
    diseaseCount: 0,
    imageAlt: null,
  }));
  return [...plantEntries, ...diseaseEntries];
}

function rank(entry: SearchEntry, tokens: string[], whole: string): number {
  if (entry.titleKey.startsWith(whole)) return 0;
  const words = entry.titleKey.split(/\s+/);
  if (tokens.every((token) => words.some((word) => word.startsWith(token)))) return 1;
  return 2;
}

/** Every word must appear somewhere. Plants win ties, then the original order is kept. */
export function searchCatalog(index: readonly SearchEntry[], query: string): SearchEntry[] {
  const whole = normalize(query).replace(/\s+/g, " ");
  if (!whole) return [...index];
  const tokens = whole.split(" ");
  return index
    .map((entry, position) => ({ entry, position }))
    .filter(({ entry }) => tokens.every((token) => entry.haystack.includes(token)))
    .map((item) => ({ ...item, rank: rank(item.entry, tokens, whole) }))
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        (a.entry.kind === b.entry.kind ? 0 : a.entry.kind === "plant" ? -1 : 1) ||
        a.position - b.position,
    )
    .map(({ entry }) => entry);
}
