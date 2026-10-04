import { describe, expect, it, vi } from "vitest";
import { createApiCatalog, isValidSlug } from "./catalog";
import { createSeedCatalog } from "@/test-utils/seed-catalog";
import { loadSeedData } from "@/test-utils/seed-data";

const envelope = (data: unknown, status = 200) =>
  Response.json({ success: status < 400, data, error: null }, { status });

describe("isValidSlug", () => {
  it("accepts catalog slugs and rejects path tricks", () => {
    expect(isValidSlug("bell-pepper")).toBe(true);
    expect(isValidSlug("../etc")).toBe(false);
    expect(isValidSlug("a/b")).toBe(false);
    expect(isValidSlug("")).toBe(false);
    expect(isValidSlug("A")).toBe(false);
  });
});

describe("createApiCatalog", () => {
  it("fetches plants with revalidate caching and unwraps the envelope", async () => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () =>
      envelope({ items: [{ slug: "apple" }] }),
    );
    const catalog = createApiCatalog({ baseUrl: "http://api/api/v1", fetch: fetchMock });
    await expect(catalog.plants()).resolves.toEqual([{ slug: "apple" }]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { next?: unknown }];
    expect(url).toBe("http://api/api/v1/plants");
    expect(init.next).toEqual({ revalidate: 3600, tags: ["catalog"] });
  });

  it("returns null for a missing plant or disease", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ success: false, data: null, error: { code: "not_found" } }, { status: 404 }),
    );
    const catalog = createApiCatalog({ baseUrl: "http://api/api/v1", fetch: fetchMock });
    await expect(catalog.plant("nope")).resolves.toBeNull();
    await expect(catalog.disease("tomato", "nope")).resolves.toBeNull();
  });

  it("never calls the API for an invalid slug", async () => {
    const fetchMock = vi.fn();
    const catalog = createApiCatalog({ baseUrl: "http://api/api/v1", fetch: fetchMock });
    await expect(catalog.plant("../x")).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws a readable error when the API is unreachable", async () => {
    const catalog = createApiCatalog({
      baseUrl: "http://api/api/v1",
      fetch: async () => {
        throw new Error("connect ECONNREFUSED");
      },
    });
    await expect(catalog.plants()).rejects.toMatchObject({ code: "api_unreachable" });
  });

  it("propagates server failures", async () => {
    const catalog = createApiCatalog({
      baseUrl: "http://api/api/v1",
      fetch: async () => Response.json({ success: false }, { status: 500 }),
    });
    await expect(catalog.plants()).rejects.toMatchObject({ status: 500 });
  });
});

describe("createSeedCatalog (mock mode)", () => {
  it("serves 13 plants and 27 diseases with plant scoped slugs", async () => {
    const catalog = createSeedCatalog(await loadSeedData());
    const plants = await catalog.plants();
    expect(plants).toHaveLength(13);
    expect(await catalog.diseases()).toHaveLength(27);
    const tomato = await catalog.plant("tomato");
    expect(tomato?.disease_count).toBe(tomato?.diseases.length);
    expect(tomato?.diseases.length).toBeGreaterThan(0);
  });

  it("lists Blueberry and Soybean with no diseases", async () => {
    const catalog = createSeedCatalog(await loadSeedData());
    expect((await catalog.plant("blueberry"))?.diseases).toEqual([]);
    expect((await catalog.plant("soybean"))?.diseases).toEqual([]);
  });

  it("returns disease detail with ordered symptoms, treatments and preventions", async () => {
    const catalog = createSeedCatalog(await loadSeedData());
    const detail = await catalog.disease("tomato", "early-blight");
    expect(detail?.plant.slug).toBe("tomato");
    expect(detail?.symptoms.length).toBeGreaterThan(0);
    expect(detail?.treatments.length).toBeGreaterThan(0);
    expect(detail?.images).toEqual([]);
    expect(await catalog.disease("potato", "bacterial-spot")).toBeNull();
  });
});
