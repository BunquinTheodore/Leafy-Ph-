export interface SitemapEntry {
  url: string;
  lastModified: Date;
  changeFrequency: "daily" | "weekly" | "monthly" | "yearly";
  priority: number;
}

interface StaticRoute {
  path: string;
  changeFrequency: SitemapEntry["changeFrequency"];
  priority: number;
}

/** Public pages only. Private, auth, token and brand pages are never listed. */
export const STATIC_ROUTES: readonly StaticRoute[] = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/handbook", changeFrequency: "weekly", priority: 0.9 },
  { path: "/about", changeFrequency: "monthly", priority: 0.5 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
];

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export interface SitemapInput {
  origin: string;
  /** Catalog API base such as http://api:8000/api/v1. */
  apiBaseUrl: string;
  fetcher: Fetcher;
  now: Date;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const isSlug = (value: unknown): value is string => typeof value === "string" && SLUG.test(value);

async function listItems(fetcher: Fetcher, url: string): Promise<unknown[]> {
  try {
    const response = await fetcher(url);
    if (!response.ok) return [];
    const body = (await response.json()) as { data?: { items?: unknown } } | null;
    const items = body?.data?.items;
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

const field = (row: unknown, key: string): unknown =>
  (row as Record<string, unknown> | null)?.[key];

/**
 * Static pages plus every plant and disease in the handbook. The catalog is optional: when the
 * API is down or answers badly the sitemap still lists the static pages instead of failing.
 */
export async function buildSitemap({
  origin,
  apiBaseUrl,
  fetcher,
  now,
}: SitemapInput): Promise<SitemapEntry[]> {
  const [plants, diseases] = await Promise.all([
    listItems(fetcher, `${apiBaseUrl}/plants`),
    listItems(fetcher, `${apiBaseUrl}/diseases`),
  ]);

  const paths = new Map<string, Omit<StaticRoute, "path">>();
  for (const route of STATIC_ROUTES) {
    paths.set(route.path, { changeFrequency: route.changeFrequency, priority: route.priority });
  }
  for (const row of plants) {
    const slug = field(row, "slug");
    if (isSlug(slug)) paths.set(`/handbook/${slug}`, { changeFrequency: "monthly", priority: 0.8 });
  }
  for (const row of diseases) {
    const slug = field(row, "slug");
    const plant = field(row, "plant_slug");
    if (isSlug(slug) && isSlug(plant)) {
      paths.set(`/handbook/${plant}/${slug}`, { changeFrequency: "monthly", priority: 0.7 });
    }
  }

  return [...paths].map(([path, rest]) => ({
    url: `${origin}${path}`,
    lastModified: now,
    ...rest,
  }));
}
