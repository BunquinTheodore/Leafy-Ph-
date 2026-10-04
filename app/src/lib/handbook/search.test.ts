import { describe, expect, it } from "vitest";
import { buildSearchIndex, firstScientificName, searchCatalog } from "./search";
import type { DiseaseSummary, PlantSummary } from "./types";

const plant = (slug: string, name: string, extra: Partial<PlantSummary> = {}): PlantSummary => ({
  slug,
  name,
  scientific_name: null,
  family: null,
  plant_type: null,
  image_url: null,
  image_alt: null,
  disease_count: 0,
  ...extra,
});

const disease = (plant_slug: string, plant_name: string, name: string): DiseaseSummary => ({
  slug: name.toLowerCase().replace(/\s+/g, "-"),
  plant_slug,
  plant_name,
  name,
  display_name: name,
  pathogen_type: "fungal",
  severity: "High",
});

const index = buildSearchIndex(
  [
    plant("tomato", "Tomato", { scientific_name: "Solanum lycopersicum" }),
    plant("potato", "Potato"),
    plant("blueberry", "Blueberry"),
  ],
  [
    disease("tomato", "Tomato", "Early Blight"),
    disease("potato", "Potato", "Early Blight"),
    disease("potato", "Potato", "Late Blight"),
  ],
);

describe("searchCatalog", () => {
  it("returns everything for an empty query", () => {
    expect(searchCatalog(index, "  ")).toHaveLength(6);
  });

  it("matches plants and diseases, plants first on equal rank", () => {
    const hits = searchCatalog(index, "potato");
    expect(hits.map((hit) => `${hit.kind}:${hit.href}`)).toEqual([
      "plant:/handbook/potato",
      "disease:/handbook/potato/early-blight",
      "disease:/handbook/potato/late-blight",
    ]);
  });

  it("requires every word and ignores case and accents", () => {
    expect(searchCatalog(index, "TOMATO blight").map((hit) => hit.href)).toEqual([
      "/handbook/tomato/early-blight",
    ]);
    expect(searchCatalog(index, "solanum")).toHaveLength(1);
  });

  it("ranks a title prefix above a later match", () => {
    const hits = searchCatalog(index, "late");
    expect(hits[0]?.href).toBe("/handbook/potato/late-blight");
  });

  it("returns nothing when no entry matches", () => {
    expect(searchCatalog(index, "zzzz")).toEqual([]);
  });
});

describe("firstScientificName", () => {
  it("keeps the first binomial of a long scientific name", () => {
    expect(firstScientificName("Vaccinium corymbosum (Highbush), Vaccinium angustifolium")).toBe(
      "Vaccinium corymbosum",
    );
    expect(firstScientificName("Malus domestica")).toBe("Malus domestica");
    expect(firstScientificName(null)).toBe("");
  });
});
