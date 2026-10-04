/** Public handbook DTOs, mirroring api/app/schemas/catalog.py. */
export interface PlantSummary {
  slug: string;
  name: string;
  scientific_name: string | null;
  family: string | null;
  plant_type: string | null;
  image_url: string | null;
  image_alt: string | null;
  disease_count: number;
}

export interface DiseaseSummary {
  slug: string;
  plant_slug: string;
  plant_name: string;
  name: string;
  display_name: string;
  pathogen_type: string | null;
  severity: string | null;
}

export interface PlantDetail extends PlantSummary {
  soil_type: string | null;
  light: string | null;
  water_needs: string | null;
  temperature: string | null;
  diseases: DiseaseSummary[];
}

export interface DiseaseImage {
  url: string;
  alt_text: string | null;
}

export interface DiseaseDetail {
  slug: string;
  name: string;
  display_name: string;
  plant: { slug: string; name: string };
  cause: string | null;
  pathogen_type: string | null;
  pathogen_name: string | null;
  severity: string | null;
  symptoms: string[];
  treatments: string[];
  preventions: string[];
  affected_species: string[];
  images: DiseaseImage[];
}
