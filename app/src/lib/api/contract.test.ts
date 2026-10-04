import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeStats } from "@/components/dashboard/data";
import {
  scanCreatedSchema,
  scanDetailSchema,
  scanListSchema,
  scanSummarySchema,
  SCAN_STAGES,
  SCAN_STATUSES,
  SCAN_VERDICTS,
} from "@/lib/scans/types";
import { authSessionSchema, googleSessionSchema, refreshOutSchema, userSchema } from "./types";

/** Contract checks against api/openapi.json, the single source of truth for the wire format. */
interface OpenApiSchema {
  properties?: Record<string, unknown>;
  required?: string[];
  enum?: string[];
}
const API_DIR = resolve(__dirname, "../../../../api");
const spec = JSON.parse(readFileSync(resolve(API_DIR, "openapi.json"), "utf8")) as {
  components: { schemas: Record<string, OpenApiSchema> };
};
const schemas = spec.components.schemas;
const keysOf = (name: string): string[] => Object.keys(schemas[name]?.properties ?? {}).sort();
const shapeKeys = (schema: { shape: Record<string, unknown> }): string[] =>
  Object.keys(schema.shape).sort();

describe("web schemas match api/openapi.json", () => {
  it.each([
    ["ScanSummaryOut", scanSummarySchema],
    ["ScanDetailOut", scanDetailSchema],
    ["ScanCreatedOut", scanCreatedSchema],
    ["ScanListOut", scanListSchema],
    ["UserOut", userSchema],
    ["AuthSessionOut", authSessionSchema],
    ["GoogleSessionOut", googleSessionSchema],
    ["RefreshOut", refreshOutSchema],
  ] as const)("%s has the same fields", (name, schema) => {
    expect(shapeKeys(schema)).toEqual(keysOf(name));
  });

  it("scan enums match", () => {
    expect([...SCAN_STATUSES].sort()).toEqual([...(schemas.ScanStatus?.enum ?? [])].sort());
    expect([...SCAN_STAGES].sort()).toEqual([...(schemas.ScanStage?.enum ?? [])].sort());
    expect([...SCAN_VERDICTS].sort()).toEqual([...(schemas.ScanVerdict?.enum ?? [])].sort());
  });

  it("dashboard stats read the real ScanStatsOut fields", () => {
    expect(keysOf("ScanStatsOut")).toEqual(["by_verdict", "last_30_days", "top_diseases", "total"]);
    const stats = normalizeStats({
      total: 9,
      last_30_days: 4,
      by_verdict: { disease: 5, healthy: 3, unknown: 1 },
      top_diseases: [
        {
          plant_slug: "tomato",
          plant_name: "Tomato",
          disease_slug: "early-blight",
          disease_name: "Early blight",
          display_name: "Early blight",
          count: 5,
        },
      ],
    });
    expect(stats).toMatchObject({ total: 9, last30Days: 4, healthy: 3, diseased: 5, unknown: 1 });
    expect(stats?.topDiseases[0]).toMatchObject({ name: "Early blight", count: 5 });
  });

  it("every error code the web branches on exists in the API", () => {
    const source = readFileSync(resolve(API_DIR, "app/core/errors.py"), "utf8");
    // api_unreachable is raised by the Next proxy itself, never by the API.
    const codes = new Set([
      "api_unreachable",
      ...[...source.matchAll(/= "([a-z_]+)"/g)].map((match) => match[1]),
    ]);
    const web = readFileSync(resolve(__dirname, "../scans/errors.ts"), "utf8");
    const used = [...web.matchAll(/case "([a-z_]+)":/g)].map((match) => match[1]);
    expect(used.length).toBeGreaterThan(5);
    expect(used.filter((code) => !codes.has(code ?? ""))).toEqual([]);
  });
});
