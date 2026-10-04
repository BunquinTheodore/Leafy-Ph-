import type { Metadata } from "next";
import { ContentsPanel, DocumentPage } from "@/components/legal/DocumentPage";
import { privacyContent as doc } from "@/components/legal/content/privacy";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Privacy Policy",
  description:
    "What Leafy keeps about you, why, and how to delete it. Plain language draft for review.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <DocumentPage
      label="Privacy Policy sections"
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
