import { describe, expect, it } from "vitest";
import { severityBrief, severityLevel } from "./severity";
import { loadSeedData } from "@/test-utils/seed-data";

describe("severityBrief", () => {
  it("keeps short sentences and drops long ones", () => {
    expect(severityBrief("Severe; can result in complete crop loss if not managed.")).toBe(
      "Severe; can result in complete crop loss if not managed.",
    );
    expect(severityBrief("x".repeat(71))).toBeNull();
    expect(severityBrief(null)).toBeNull();
  });
});

describe("severityLevel", () => {
  it("reads the highest level named in the first clause", () => {
    expect(severityLevel("Moderate to severe, depending on weather")).toBe("severe");
    expect(severityLevel("Usually low to moderate; can become severe in susceptible plants")).toBe(
      "moderate",
    );
    expect(severityLevel("Mild to moderate; can become severe")).toBe("moderate");
    expect(severityLevel("Moderate to High. Early blight can cause losses")).toBe("high");
    expect(severityLevel("Can be severe if unmanaged")).toBe("severe");
    expect(severityLevel("Mild")).toBe("low");
  });

  it("returns null when no level is named", () => {
    expect(severityLevel(null)).toBeNull();
    expect(severityLevel("")).toBeNull();
    expect(severityLevel("Varies a lot")).toBeNull();
  });

  it("agrees with the curated severity_level for every seeded disease", async () => {
    const { rawDiseases } = await loadSeedData();
    expect(rawDiseases.length).toBe(27);
    for (const disease of rawDiseases) {
      expect(severityLevel(disease.severity), `${disease.plant}/${disease.slug}`).toBe(
        disease.severity_level,
      );
    }
  });
});
