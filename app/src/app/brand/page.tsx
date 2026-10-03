import type { Metadata } from "next";
import { SlidePanels, type Panel } from "@/components/slide-panels/SlidePanels";
import {
  ColorSection,
  ComponentsSection,
  LogoSection,
  MotionSection,
  RulesSection,
  TypeSection,
  VoiceSection,
} from "./sections";

export const metadata: Metadata = {
  title: "Brand guide",
  description: "Leafy logo, color, type, voice, components and motion.",
  robots: { index: false, follow: false },
};

const panels: Panel[] = [
  { id: "logo", title: "Logo", content: <LogoSection /> },
  { id: "color", title: "Color", content: <ColorSection /> },
  { id: "type", title: "Type", content: <TypeSection /> },
  { id: "voice", title: "Voice", content: <VoiceSection /> },
  { id: "components", title: "Components", content: <ComponentsSection /> },
  { id: "motion", title: "Motion", content: <MotionSection /> },
  { id: "rules", title: "Rules", content: <RulesSection /> },
];

export default function BrandPage() {
  return (
    <div className="stage-fill">
      <SlidePanels label="Brand guide" panels={panels} />
    </div>
  );
}
