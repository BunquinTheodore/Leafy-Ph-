import { describe, expect, it } from "vitest";
import {
  isLive,
  normalizeScanList,
  normalizeStats,
  scanLabel,
  splitSegments,
  type ScanSummary,
} from "./data";

describe("normalizeStats", () => {
  it("reads ScanStatsOut", () => {
    const stats = normalizeStats({
      total: 12,
      last_30_days: 5,
      by_verdict: { healthy: 7, disease: 4, unknown: 1 },
      top_diseases: [
        {
          plant_slug: "tomato",
          plant_name: "Tomato",
          disease_slug: "early-blight",
          disease_name: "Tomato Early Blight",
          display_name: "Early blight",
          count: 3,
        },
      ],
    });
    expect(stats).toEqual({
      total: 12,
      last30Days: 5,
      healthy: 7,
      diseased: 4,
      unknown: 1,
      topDiseases: [{ name: "Early blight", plantName: "Tomato", count: 3 }],
    });
  });

  it("keeps only five diseases, most common first, and drops bad rows", () => {
    const stats = normalizeStats({
      total: 20,
      last_30_days: 20,
      by_verdict: { healthy: 0, disease: 20, unknown: 0 },
      top_diseases: [
        { display_name: "a", count: 1 },
        { display_name: "b", count: 6 },
        { display_name: "c", count: 5 },
        { display_name: "d", count: 4 },
        { display_name: "e", count: 3 },
        { display_name: "f", count: 2 },
        { count: 9 },
        { display_name: "g", count: -1 },
      ],
    });
    expect(stats?.topDiseases.map((row) => row.name)).toEqual(["b", "c", "d", "e", "f"]);
  });

  it("returns null for data that is not stats", () => {
    expect(normalizeStats(null)).toBeNull();
    expect(normalizeStats("nope")).toBeNull();
    expect(normalizeStats({ total: "many" })).toBeNull();
  });

  it("treats missing counters as zero", () => {
    expect(normalizeStats({ total: 0 })).toMatchObject({
      total: 0,
      last30Days: 0,
      healthy: 0,
      diseased: 0,
      unknown: 0,
      topDiseases: [],
    });
  });
});

describe("normalizeScanList", () => {
  const raw = {
    id: "s1",
    status: "completed",
    verdict: "disease",
    plant: { slug: "tomato", name: "Tomato" },
    disease: { slug: "early-blight", name: "Tomato Early Blight", display_name: "Early blight" },
    created_at: "2026-10-01T10:00:00Z",
    confidence: "0.93",
  };

  it("reads the items of a ScanListOut and ignores anything else", () => {
    expect(normalizeScanList({ items: [raw], next_cursor: null })).toHaveLength(1);
    expect(normalizeScanList([raw])).toEqual([]);
  });

  it("maps fields and skips invalid entries", () => {
    const list = normalizeScanList({
      items: [raw, { id: 4 }, null, { id: "s2", status: "weird" }],
    });
    expect(list).toEqual([
      {
        id: "s1",
        status: "completed",
        stage: null,
        failureCode: null,
        verdict: "disease",
        plantName: "Tomato",
        diseaseName: "Early blight",
        confidence: "0.93",
        createdAt: "2026-10-01T10:00:00Z",
        imageUrl: null,
      },
    ]);
  });

  it("returns an empty list for unexpected data", () => {
    expect(normalizeScanList(undefined)).toEqual([]);
    expect(normalizeScanList({ items: "x" })).toEqual([]);
  });
});

describe("scan helpers", () => {
  const base: ScanSummary = {
    id: "a",
    status: "completed",
    stage: null,
    failureCode: null,
    verdict: "healthy",
    plantName: "Basil",
    diseaseName: null,
    confidence: null,
    createdAt: "2026-10-01T10:00:00Z",
    imageUrl: null,
  };

  it("marks processing scans as live", () => {
    expect(isLive(base)).toBe(false);
    expect(isLive({ ...base, status: "processing" })).toBe(true);
  });

  it("labels a scan with its plant, falling back politely", () => {
    expect(scanLabel(base)).toBe("Basil");
    expect(scanLabel({ ...base, plantName: null })).toBe("Unknown plant");
  });
});

describe("splitSegments", () => {
  it("returns fractions that add up to one", () => {
    const segments = splitSegments({ healthy: 6, diseased: 3, unknown: 1 });
    expect(segments.map((segment) => segment.key)).toEqual(["healthy", "diseased", "unknown"]);
    expect(segments.map((segment) => segment.fraction)).toEqual([0.6, 0.3, 0.1]);
    expect(segments.reduce((sum, segment) => sum + segment.fraction, 0)).toBeCloseTo(1);
  });

  it("gives zero fractions when there is nothing to split", () => {
    const segments = splitSegments({ healthy: 0, diseased: 0, unknown: 0 });
    expect(segments.every((segment) => segment.fraction === 0)).toBe(true);
  });
});
