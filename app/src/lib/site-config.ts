/**
 * The only place for details the team still has to supply before launch. Every value here is a
 * visible placeholder in square brackets, so nothing invented can ship unnoticed. Replace the
 * values (and drop the brackets) when the real details exist; the README lists each TODO.
 */
const placeholder = (label: string): string => `[TODO: ${label}]`;

/** Legal contact email shown in the Privacy Policy and the Terms of Use. */
export const LEGAL_CONTACT_EMAIL = placeholder("legal contact email");

export interface TeamMember {
  /** Replace with the person's real name. */
  name: string;
  role: string;
  summary: string;
}

/** The About page team list. Names are placeholders until the team adds them. */
export const TEAM_MEMBERS: readonly TeamMember[] = [
  {
    name: placeholder("name of the product and web lead"),
    role: "Product, web app and service",
    summary: "designs and builds what you see and use.",
  },
  {
    name: placeholder("name of the machine learning lead"),
    role: "Machine learning",
    summary: "trains the model that reads leaf photos.",
  },
  {
    name: placeholder("name of the plant data lead"),
    role: "Plant and disease data",
    summary: "collects and reviews the handbook.",
  },
];

export const isPlaceholder = (value: string): boolean => /^\[TODO: [^\]]+\]$/.test(value);
