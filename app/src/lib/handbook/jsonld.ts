export interface BreadcrumbItem {
  name: string;
  path: string;
}

/** BreadcrumbList structured data. `<` is escaped so the JSON can never close its script tag. */
export function breadcrumbJsonLd(origin: string, items: readonly BreadcrumbItem[]): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${origin}${item.path}`,
    })),
  }).replace(/</g, "\\u003c");
}
