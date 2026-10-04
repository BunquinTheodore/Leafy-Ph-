import { serializeJsonLd } from "@/lib/seo/jsonld";

/** Structured data for search engines. It is data, not code, so the CSP nonce does not apply. */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
