import type { MetadataRoute } from "next";

/** Never crawled: member pages, the team brand guide and the API. */
export const PRIVATE_PATHS = [
  "/api/",
  "/brand",
  "/dashboard",
  "/scan",
  "/scans",
  "/account",
] as const;

export function robotsConfig(origin: string): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: [...PRIVATE_PATHS] }],
    sitemap: `${origin}/sitemap.xml`,
  };
}
