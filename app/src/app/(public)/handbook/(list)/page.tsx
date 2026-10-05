import type { Metadata } from "next";
import { headers } from "next/headers";
import { HandbookBrowser } from "@/components/handbook/HandbookBrowser";
import { HandbookStage } from "@/components/handbook/HandbookStage";
import { getCatalog } from "@/lib/handbook/catalog";
import { guessViewportSize } from "@/lib/handbook/device";
import { buildSearchIndex } from "@/lib/handbook/search";

export const metadata: Metadata = {
  title: "Plant handbook",
  description:
    "Look up plants and their diseases in plain words: causes, symptoms, treatment and prevention.",
  alternates: { canonical: "/handbook" },
};

export default async function HandbookPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { q } = await searchParams;
  const catalog = await getCatalog();
  const [plants, diseases] = await Promise.all([catalog.plants(), catalog.diseases()]);
  const index = buildSearchIndex(plants, diseases);
  return (
    <HandbookStage>
      <div className="hb" data-layout="catalog">
        <HandbookBrowser
          index={index}
          initialQuery={typeof q === "string" ? q : ""}
          initialSize={guessViewportSize(await headers())}
        />
      </div>
    </HandbookStage>
  );
}
