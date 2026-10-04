import type { MetadataRoute } from "next";

/** Never crawled: member pages, one time token pages, the team brand guide and the API. */
export const PRIVATE_PATHS = [
  "/api/",
  "/brand",
  "/dashboard",
  "/scan",
  "/scans",
  "/account",
  "/reset-password",
  "/verify-email",
] as const;

export function robotsConfig(origin: string): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: [...PRIVATE_PATHS] }],
    sitemap: `${origin}/sitemap.xml`,
  };
}
