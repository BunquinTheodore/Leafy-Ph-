import type { Metadata } from "next";
import { ContentsPanel, DocumentPage } from "@/components/legal/DocumentPage";
import { termsContent as doc } from "@/components/legal/content/terms";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Terms of Use",
  description:
    "How Leafy may be used and what to expect from its results. Plain language draft for review.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <DocumentPage
      label="Terms of Use sections"
      eyebrow={doc.eyebrow}
      title={doc.title}
      draftNote={doc.draftNote}
      lead={{
        title: "Contents",
        content: (
          <ContentsPanel intro={doc.intro} draftNote={doc.draftNote} sections={doc.sections} />
        ),
      }}
      sections={doc.sections}
    />
  );
}
