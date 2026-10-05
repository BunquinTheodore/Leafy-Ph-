import { TEAM_MEMBERS } from "@/lib/site-config";
import type { LegalSection } from "./types";

/**
 * About panels. Team names come from src/lib/site-config.ts, where they are marked placeholders
 * until the team adds them before launch.
 */
export const aboutSections: readonly LegalSection[] = [
  {
    id: "what-leafy-is",
    title: "What Leafy is",
    paragraphs: [
      "Leafy is a plant doctor in your pocket. Take a photo of a leaf, understand what may be wrong, and know what to do next.",
      "Alongside scanning, the handbook is a free guide to common plants and the diseases that affect them, with causes, symptoms, treatment and prevention in plain language.",
    ],
  },
  {
    id: "how-it-works",
    title: "How it works",
    paragraphs: ["Three calm steps from photo to plan."],
    items: [
      "Take a close, flat photo of one leaf in daylight.",
      "Leafy reads the photo and suggests the plant and what may be affecting it.",
      "Read the causes, treatment and prevention, then check the handbook for more.",
    ],
  },
  {
    id: "team",
    title: "The team",
    paragraphs: ["Leafy is built by a small team. Each part has its own owner."],
    items: TEAM_MEMBERS.map((member) => `${member.name}, ${member.role}: ${member.summary}`),
  },
];
