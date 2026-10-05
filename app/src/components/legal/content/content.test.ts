import { describe, expect, it } from "vitest";
import { aboutSections } from "./about";
import { privacyContent } from "./privacy";
import { termsContent } from "./terms";
import { LEGAL_CONTACT_EMAIL, TEAM_MEMBERS, isPlaceholder } from "@/lib/site-config";
import { CONTACT_PLACEHOLDER } from "./types";

const documents = [
  ["privacy", privacyContent.sections, privacyContent],
  ["terms", termsContent.sections, termsContent],
] as const;

describe.each(documents)("%s content", (_name, sections, doc) => {
  it("is clearly marked as a draft for review", () => {
    expect(doc.draftNote).toMatch(/draft/i);
    expect(doc.draftNote).toMatch(/not legal advice/i);
  });

  it("has unique, URL safe section ids", () => {
    const ids = sections.map((section) => section.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z]+(?:-[a-z]+)*$/);
  });

  it("keeps each panel within the content budget (3 paragraphs, 6 list items)", () => {
    for (const section of sections) {
      expect(section.paragraphs.length, section.id).toBeLessThanOrEqual(3);
      expect(section.items?.length ?? 0, section.id).toBeLessThanOrEqual(6);
      expect(section.paragraphs.length + (section.items?.length ?? 0)).toBeGreaterThan(0);
    }
  });

  it("follows the voice rules: no exclamation marks, no soft hyphens", () => {
    const text = JSON.stringify(doc);
    expect(text).not.toContain("!");
    expect(text).not.toContain("­");
    expect(text).not.toContain("&shy;");
  });
});

describe("contact details", () => {
  it("uses a visible placeholder in both legal pages instead of an invented address", () => {
    expect(JSON.stringify(privacyContent)).toContain(CONTACT_PLACEHOLDER);
    expect(JSON.stringify(termsContent)).toContain(CONTACT_PLACEHOLDER);
  });
});

describe("site config placeholders", () => {
  it("marks the legal contact email as a TODO placeholder", () => {
    expect(isPlaceholder(LEGAL_CONTACT_EMAIL)).toBe(true);
    expect(CONTACT_PLACEHOLDER).toBe(LEGAL_CONTACT_EMAIL);
  });

  it("recognizes real values as not placeholders", () => {
    expect(isPlaceholder("team@leafy.example")).toBe(false);
  });
});

describe("about content", () => {
  it("has no origin story and no separate name section", () => {
    const text = JSON.stringify(aboutSections);
    expect(text).not.toMatch(/DAHON|Dahon/);
    expect(aboutSections.find((section) => section.id === "the-name")).toBeUndefined();
  });

  it("shows every team name as a visible TODO placeholder, never an invented name", () => {
    const team = aboutSections.find((section) => section.id === "team");
    expect(team?.items).toHaveLength(TEAM_MEMBERS.length);
    for (const member of TEAM_MEMBERS) expect(isPlaceholder(member.name), member.name).toBe(true);
    for (const item of team?.items ?? []) expect(item).toMatch(/^\[TODO: [^\]]+\]/);
  });

  it("stays calm and within the panel budget", () => {
    for (const section of aboutSections) {
      expect(section.paragraphs.length).toBeLessThanOrEqual(3);
      expect(section.items?.length ?? 0).toBeLessThanOrEqual(6);
    }
    expect(JSON.stringify(aboutSections)).not.toContain("!");
  });
});
