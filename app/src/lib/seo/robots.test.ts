import { describe, expect, it } from "vitest";
import { PRIVATE_PATHS, robotsConfig } from "./robots";

describe("robotsConfig", () => {
  const config = robotsConfig("https://leafy.example");
  const rule = Array.isArray(config.rules) ? config.rules[0] : config.rules;

  it("allows the site and points at the sitemap", () => {
    expect(rule?.userAgent).toBe("*");
    expect(rule?.allow).toBe("/");
    expect(config.sitemap).toBe("https://leafy.example/sitemap.xml");
  });

  it("disallows private routes, token pages, the brand guide and the API", () => {
    const disallow = rule?.disallow as string[];
    for (const path of ["/api/", "/brand", "/dashboard", "/scan", "/scans", "/account"]) {
      expect(disallow).toContain(path);
    }
  });

  it("keeps public pages crawlable", () => {
    for (const path of ["/", "/handbook", "/about", "/privacy", "/terms"]) {
      expect(PRIVATE_PATHS.some((blocked) => path.startsWith(blocked))).toBe(false);
    }
  });
});
