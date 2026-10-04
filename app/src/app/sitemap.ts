import type { MetadataRoute } from "next";
import { catalogApiBase, siteOrigin } from "@/lib/seo/origin";
import { buildSitemap } from "@/lib/seo/sitemap";

/** Rendered per request (the origin comes from the environment); catalog fetches are cached for an hour. */
export const dynamic = "force-dynamic";

const CATALOG_REVALIDATE_SECONDS = 3600;
const CATALOG_TIMEOUT_MS = 4000;

export default function sitemap(): Promise<MetadataRoute.Sitemap> {
  return buildSitemap({
    origin: siteOrigin(),
    apiBaseUrl: catalogApiBase(),
    now: new Date(),
    fetcher: (url) =>
      fetch(url, {
        headers: { accept: "application/json" },
        next: { revalidate: CATALOG_REVALIDATE_SECONDS },
        signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS),
      }),
  });
}
