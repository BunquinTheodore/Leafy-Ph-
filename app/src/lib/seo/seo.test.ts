import { describe, expect, it } from "vitest";
import {
  aboutJsonLd,
  faqPageJsonLd,
  organizationJsonLd,
  serializeJsonLd,
  websiteJsonLd,
} from "./jsonld";
import { pageMetadata } from "./metadata";

describe("pageMetadata", () => {
  const meta = pageMetadata({
    title: "About",
    description: "What Leafy is and where it comes from.",
    path: "/about",
  });

  it("sets a canonical path, resolved against metadataBase by Next", () => {
    expect(meta.alternates?.canonical).toBe("/about");
  });

  it("repeats the share image in Open Graph and Twitter (page metadata replaces the root one)", () => {
    expect(meta.openGraph).toMatchObject({
      type: "website",
      url: "/about",
      siteName: "Leafy",
      title: "About | Leafy",
    });
    const og = meta.openGraph as { images?: Array<{ url: string; width: number }> };
    expect(og.images?.[0]).toMatchObject({ url: "/og/og-image.png", width: 1200 });
    expect(meta.twitter).toMatchObject({ card: "summary_large_image", title: "About | Leafy" });
  });

  it("is indexable by default and can be marked noindex", () => {
    expect(meta.robots).toBeUndefined();
    const hidden = pageMetadata({
      title: "Account",
      description: "x",
      path: "/account",
      noindex: true,
    });
    expect(hidden.robots).toEqual({ index: false, follow: false });
  });

  it("keeps descriptions short enough for search results", () => {
    expect(() => pageMetadata({ title: "T", description: "x".repeat(200), path: "/" })).toThrow(
      /description/,
    );
  });
});

describe("JSON-LD", () => {
  it("describes the site and the organization with absolute URLs", () => {
    const site = websiteJsonLd("https://leafy.example");
    expect(site).toMatchObject({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Leafy",
      url: "https://leafy.example",
    });
    const org = organizationJsonLd("https://leafy.example");
    expect(org).toMatchObject({ "@type": "Organization", name: "Leafy" });
    expect(String(org.logo)).toBe("https://leafy.example/icons/icon-512.png");
  });

  it("builds an AboutPage that points at the organization", () => {
    const page = aboutJsonLd("https://leafy.example");
    expect(page["@type"]).toBe("AboutPage");
    expect(page.url).toBe("https://leafy.example/about");
  });

  it("escapes characters that could close the script tag", () => {
    const text = serializeJsonLd({ name: "</script><script>alert(1)</script>" });
    expect(text).not.toContain("</script>");
    expect(text).not.toContain("<");
    expect(JSON.parse(text).name).toBe("</script><script>alert(1)</script>");
  });

  it("keeps a hostile FAQ answer from closing the script tag", () => {
    const hostile = "Rose</script><script>alert(1)</script>";
    const text = serializeJsonLd(faqPageJsonLd([{ question: "Which plants?", answer: hostile }]));
    expect(text).not.toContain("<");
    const parsed = JSON.parse(text);
    expect(parsed["@type"]).toBe("FAQPage");
    expect(parsed.mainEntity[0].acceptedAnswer.text).toBe(hostile);
  });
});
