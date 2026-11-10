import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { diseasePhotos } from "./disease-photos";

describe("diseasePhotos", () => {
  it("returns photos with credit and a Commons source for a known disease", () => {
    const photos = diseasePhotos("tomato", "late-blight");
    expect(photos.length).toBeGreaterThan(0);
    for (const photo of photos) {
      expect(photo.credit).not.toBe("");
      expect(photo.license).not.toBe("");
      expect(photo.source).toMatch(/^https:\/\/commons\.wikimedia\.org\//);
    }
  });

  it("returns an empty list when a disease has no photos", () => {
    expect(diseasePhotos("cherry", "powdery-mildew")).toEqual([]);
    expect(diseasePhotos("nope", "nothing")).toEqual([]);
  });

  it("only points at files that exist in public, for every catalog disease", () => {
    const diseases = JSON.parse(
      readFileSync(path.join(process.cwd(), "..", "api/app/seeds/data/diseases.json"), "utf8"),
    ) as Array<{ plant: string; slug: string }>;
    let total = 0;
    for (const { plant, slug } of diseases)
      for (const photo of diseasePhotos(plant, slug)) {
        total += 1;
        expect(existsSync(path.join(process.cwd(), "public", photo.src))).toBe(true);
        expect(photo.credit).not.toMatch(/,\s*,|\s-\s/);
      }
    expect(total).toBeGreaterThan(30);
  });
});
