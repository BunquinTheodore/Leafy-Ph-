import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/seo/origin";
import { robotsConfig } from "@/lib/seo/robots";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return robotsConfig(siteOrigin());
}
