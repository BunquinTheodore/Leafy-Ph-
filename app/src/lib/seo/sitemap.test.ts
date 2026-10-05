import { describe, expect, it, vi } from "vitest";
import { STATIC_ROUTES, buildSitemap } from "./sitemap";

const ORIGIN = "https://leafy.example";
const NOW = new Date("2026-10-04T00:00:00Z");

const envelope = (items: unknown[]) =>
  Response.json({ success: true, data: { items }, error: null });

const catalog = () =>
  vi.fn(async (url: string) => {
    if (url.endsWith("/plants")) return envelope([{ slug: "tomato" }, { slug: "apple" }]);
    if (url.endsWith("/diseases"))
      return envelope([
        { slug: "early-blight", plant_slug: "tomato" },
        { slug: "apple-scab", plant_slug: "apple" },
      ]);
    return new Response("nope", { status: 404 });
  });

const urls = (entries: Array<{ url: string }>) => entries.map((entry) => entry.url);

describe("buildSitemap", () => {
  it("lists public pages, plants and diseases with absolute URLs", async () => {
    const entries = await buildSitemap({
      origin: ORIGIN,
      apiBaseUrl: "http://api/api/v1",
      fetcher: catalog(),
      now: NOW,
    });
    expect(urls(entries)).toEqual(
      expect.arrayContaining([
        `${ORIGIN}/`,
        `${ORIGIN}/handbook`,
        `${ORIGIN}/about`,
        `${ORIGIN}/privacy`,
        `${ORIGIN}/terms`,
        `${ORIGIN}/handbook/tomato`,
        `${ORIGIN}/handbook/apple`,
        `${ORIGIN}/handbook/tomato/early-blight`,
        `${ORIGIN}/handbook/apple/apple-scab`,
      ]),
    );
  });

  it("never lists private, auth, token or brand pages", async () => {
    const entries = await buildSitemap({
      origin: ORIGIN,
      apiBaseUrl: "http://api/api/v1",
      fetcher: catalog(),
      now: NOW,
    });
    const joined = urls(entries).join("\n");
    for (const path of [
      "/dashboard",
      "/scan",
      "/account",
      "/brand",
      "/login",
      "/register",
      "/api",
    ]) {
      expect(joined).not.toContain(`${ORIGIN}${path}`);
    }
  });

  it("falls back to the static pages when the catalog API is down", async () => {
    const down = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const entries = await buildSitemap({
      origin: ORIGIN,
      apiBaseUrl: "http://api/api/v1",
      fetcher: down,
      now: NOW,
    });
    expect(urls(entries)).toEqual(STATIC_ROUTES.map((route) => `${ORIGIN}${route.path}`));
  });

  it("falls back when the API answers with an error or junk", async () => {
    const junk = vi.fn(async () => new Response("<html>", { status: 502 }));
    const entries = await buildSitemap({
      origin: ORIGIN,
      apiBaseUrl: "http://api/api/v1",
      fetcher: junk,
      now: NOW,
    });
    expect(entries).toHaveLength(STATIC_ROUTES.length);
  });

  it("keeps plants when only the disease list fails", async () => {
    const half = vi.fn(async (url: string) =>
      url.endsWith("/plants") ? envelope([{ slug: "tomato" }]) : new Response("x", { status: 500 }),
    );
    const entries = await buildSitemap({
      origin: ORIGIN,
      apiBaseUrl: "http://api/api/v1",
      fetcher: half,
      now: NOW,
    });
    expect(urls(entries)).toContain(`${ORIGIN}/handbook/tomato`);
  });

  it("skips malformed catalog rows and unsafe slugs, and removes duplicates", async () => {
    const messy = vi.fn(async (url: string) =>
      url.endsWith("/plants")
        ? envelope([
            { slug: "tomato" },
            { slug: "tomato" },
            { slug: "../etc" },
            { name: "no slug" },
            { slug: "a b" },
          ])
        : envelope([{ slug: "early-blight", plant_slug: "tomato" }, { slug: "x" }]),
    );
    const entries = await buildSitemap({
      origin: ORIGIN,
      apiBaseUrl: "http://api/api/v1",
      fetcher: messy,
      now: NOW,
    });
    const list = urls(entries);
    expect(list.filter((u) => u === `${ORIGIN}/handbook/tomato`)).toHaveLength(1);
    expect(list.join("\n")).not.toContain("etc");
    expect(list.join("\n")).not.toContain("a b");
    expect(list.filter((u) => u.includes("/handbook/")).length).toBe(2);
  });

  it("sets sensible priorities and a modification date", async () => {
    const entries = await buildSitemap({
      origin: ORIGIN,
      apiBaseUrl: "http://api/api/v1",
      fetcher: catalog(),
      now: NOW,
    });
    expect(entries[0]).toMatchObject({ url: `${ORIGIN}/`, priority: 1, lastModified: NOW });
    const privacy = entries.find((entry) => entry.url.endsWith("/privacy"));
    expect(privacy?.priority).toBeLessThan(0.5);
  });
});
