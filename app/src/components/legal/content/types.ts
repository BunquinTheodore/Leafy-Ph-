import { LEGAL_CONTACT_EMAIL } from "@/lib/site-config";

export interface LegalSection {
  /** URL hash for the panel, such as "scan-photos" gives #scan-photos. */
  id: string;
  title: string;
  /** At most three short paragraphs per panel, so a panel never needs a scrollbar. */
  paragraphs: readonly string[];
  /** Optional list shown after the paragraphs (at most six items). */
  items?: readonly string[];
}

export interface LegalDocumentContent {
  eyebrow: string;
  title: string;
  /** Shown as the draft marker beside the title. */
  draftNote: string;
  /** Plain language summary on the contents panel. */
  intro: string;
  sections: readonly LegalSection[];
}

/** Placeholder until the team adds a real address (see src/lib/site-config.ts). */
export const CONTACT_PLACEHOLDER = LEGAL_CONTACT_EMAIL;

export const DRAFT_NOTE =
  "Draft for review. This is plain language placeholder text, not legal advice.";
