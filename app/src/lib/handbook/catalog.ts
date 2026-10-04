import { parseEnvelope } from "../api/envelope";
import { ApiError } from "../api/errors";
import { getEnv } from "../env";
import type { DiseaseDetail, DiseaseSummary, PlantDetail, PlantSummary } from "./types";

/** Catalog data changes only when the seed is re run, so an hour of caching is safe. */
export const CATALOG_REVALIDATE_SECONDS = 3600;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 120;

export const isValidSlug = (value: string): boolean =>
  value.length > 0 && value.length <= MAX_SLUG_LENGTH && SLUG.test(value);

export interface CatalogSource {
  plants(): Promise<PlantSummary[]>;
  diseases(): Promise<DiseaseSummary[]>;
  plant(slug: string): Promise<PlantDetail | null>;
  disease(plant: string, disease: string): Promise<DiseaseDetail | null>;
}

interface ApiCatalogDeps {
  baseUrl: string;
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
}

const unreachable = () =>
  new ApiError({
    status: 503,
    code: "api_unreachable",
    message: "We could not reach the handbook right now. Check your connection and try again.",
  });

/** Public catalog over the REST API, cached with fetch revalidation (no cookies, no auth). */
export function createApiCatalog({ baseUrl, fetch: doFetch }: ApiCatalogDeps): CatalogSource {
  async function send(path: string): Promise<Response> {
    try {
      return await doFetch(`${baseUrl}${path}`, {
        headers: { accept: "application/json" },
        next: { revalidate: CATALOG_REVALIDATE_SECONDS, tags: ["catalog"] },
      } as RequestInit);
    } catch {
      throw unreachable();
    }
  }

  async function read<T>(path: string): Promise<T> {
    return parseEnvelope<T>(await send(path));
  }

  async function readOrNull<T>(path: string): Promise<T | null> {
    const response = await send(path);
    if (response.status === 404) return null;
    return parseEnvelope<T>(response);
  }

  return {
    plants: async () => (await read<{ items: PlantSummary[] }>("/plants")).items,
    diseases: async () => (await read<{ items: DiseaseSummary[] }>("/diseases")).items,
    plant: async (slug) => (isValidSlug(slug) ? readOrNull<PlantDetail>(`/plants/${slug}`) : null),
    disease: async (plant, disease) =>
      isValidSlug(plant) && isValidSlug(disease)
        ? readOrNull<DiseaseDetail>(`/plants/${plant}/diseases/${disease}`)
        : null,
  };
}

/** Server only. Always reads the real API; the catalog is cached by fetch for an hour. */
export async function getCatalog(): Promise<CatalogSource> {
  return createApiCatalog({
    baseUrl: getEnv().apiBaseUrl,
    fetch: (input, init) => fetch(input, init),
  });
}
