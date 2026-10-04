import { readFile } from "node:fs/promises";
import path from "node:path";

/** Test only. Reads the committed seed JSON. */
export interface RawPlant {
  slug: string;
  name: string;
  scientific_name: string | null;
  family: string | null;
  type: string | null;
  soil_type: string | null;
  light: string | null;
  water_needs: string | null;
  temperature: string | null;
  photo_alt: string | null;
}

export interface RawDisease {
  plant: string;
  slug: string;
  name: string;
  display_name: string;
  cause: string | null;
  pathogen_type: string | null;
  pathogen_name: string | null;
  severity: string | null;
  severity_level: string | null;
  position: number;
}

export interface RawEntry {
  plant: string;
  disease: string;
  kind: "symptom" | "treatment" | "prevention";
  position: number;
  text: string;
}

export interface RawSpecies {
  plant: string;
  disease: string;
  species: string;
  position: number;
}

export interface SeedData {
  rawPlants: RawPlant[];
  rawDiseases: RawDisease[];
  rawEntries: RawEntry[];
  rawSpecies: RawSpecies[];
}

export function seedDirectory(): string {
  return (
    process.env.LEAFY_SEED_DIR ?? path.resolve(process.cwd(), "..", "api", "app", "seeds", "data")
  );
}

async function readJson<T>(directory: string, name: string): Promise<T> {
  return JSON.parse(await readFile(path.join(directory, name), "utf8")) as T;
}

let cached: Promise<SeedData> | undefined;

export function loadSeedData(): Promise<SeedData> {
  cached ??= (async () => {
    const directory = seedDirectory();
    const [rawPlants, rawDiseases, rawEntries, rawSpecies] = await Promise.all([
      readJson<RawPlant[]>(directory, "plants.json"),
      readJson<RawDisease[]>(directory, "diseases.json"),
      readJson<RawEntry[]>(directory, "entries.json"),
      readJson<RawSpecies[]>(directory, "affected_species.json"),
    ]);
    return { rawPlants, rawDiseases, rawEntries, rawSpecies };
  })();
  return cached;
}
