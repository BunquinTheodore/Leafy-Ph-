import { describe, expect, it } from "vitest";
import { z } from "zod";

describe("zod config", () => {
  it("is jitless once the API and scan types are loaded, so no eval probe breaks the CSP", async () => {
    await import("./api/types");
    await import("./scans/types");
    expect(z.core.globalConfig.jitless).toBe(true);
  });
});
