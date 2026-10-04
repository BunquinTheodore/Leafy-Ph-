import { Leaf } from "lucide-react";
import type { ReactNode } from "react";
import { LogoMark } from "../brand/Logo";
import { SlidePanels, type Panel } from "../slide-panels/SlidePanels";
import type { LegalSection } from "./content/types";
import "./legal.css";

interface DocumentPageProps {
  /** Accessible name of the carousel, such as "Privacy Policy sections". */
  label: string;
  eyebrow: string;
  title: string;
  /** Draft marker shown beside the title. Omit for finished pages such as About. */
  draftNote?: string;
  /** First panel, shown before the sections (usually the contents list). */
  lead?: { title: string; content: ReactNode };
  sections: readonly LegalSection[];
  /** Faint leaf mark in the empty corner, for pages with short panels. */
  decorate?: boolean;
}

function SectionPanel({
  section,
  index,
  total,
}: {
  section: LegalSection;
  index: number;
  total: number;
}) {
  return (
    <article className="doc-panel">
      <div className="doc-panel__side">
        <p className="doc-panel__count">
          {index + 1} of {total}
        </p>
        <h2 className="h2">{section.title}</h2>
      </div>
      <div className="prose">
        {section.paragraphs.map((text) => (
          <p key={text}>{text}</p>
        ))}
        {section.items ? (
          <ul>
            {section.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </article>
  );
}

/** Title strip plus sideways section panels. Replaces long vertical scrolling with the SlidePanels. */
export function DocumentPage({
  label,
  eyebrow,
  title,
  draftNote,
  lead,
  sections,
  decorate = false,
}: DocumentPageProps) {
  const panels: Panel[] = [
    ...(lead ? [{ id: "contents", title: lead.title, content: lead.content }] : []),
    ...sections.map((section, index) => ({
      id: section.id,
      title: section.title,
      content: <SectionPanel section={section} index={index} total={sections.length} />,
    })),
  ];

  return (
    <div className="doc-page stage-fill">
      {decorate ? (
        <div className="doc-page__mark" aria-hidden="true">
          <LogoMark height={300} />
        </div>
      ) : null}
      <header className="doc-head">
        <div className="doc-head__titles">
          <p className="eyebrow m-0">{eyebrow}</p>
          <h1 className="display display-sm">{title}</h1>
        </div>
        {draftNote ? (
          <p className="doc-draft m-0" title={draftNote}>
            <Leaf size={14} strokeWidth={1.5} aria-hidden="true" />
            Draft for review
          </p>
        ) : null}
      </header>
      <SlidePanels label={label} panels={panels} />
    </div>
  );
}

/** Contents panel: a numbered list that deep links to each section. */
export function ContentsPanel({
  intro,
  draftNote,
  sections,
}: {
  intro: string;
  draftNote?: string;
  sections: readonly LegalSection[];
}) {
  return (
    <article className="doc-panel doc-panel--contents">
      <div className="doc-panel__side">
        <p className="doc-panel__count">Contents</p>
        <h2 className="h2">Find your way</h2>
        <div className="prose">
          <p>{intro}</p>
          {draftNote ? <p>{draftNote}</p> : null}
        </div>
      </div>
      <nav aria-label="Contents">
        <ol className="doc-contents">
          {sections.map((section) => (
            <li key={section.id}>
              <a href={`#${section.id}`}>{section.title}</a>
            </li>
          ))}
        </ol>
      </nav>
    </article>
  );
}
