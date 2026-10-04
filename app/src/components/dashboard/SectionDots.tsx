"use client";

import { useEffect, useState } from "react";
import { member } from "@/lib/i18n/member-en";

interface SectionDotsProps {
  /** id of the horizontally scrolling container. */
  targetId: string;
  sections: ReadonlyArray<{ id: string; label: string }>;
}

/** Labeled dots for the phone layout, where the dashboard sections slide sideways. */
export function SectionDots({ targetId, sections }: SectionDotsProps) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const scroller = document.getElementById(targetId);
    if (!scroller) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const width = scroller.clientWidth || 1;
        setActive(
          Math.min(sections.length - 1, Math.max(0, Math.round(scroller.scrollLeft / width))),
        );
      });
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      scroller.removeEventListener("scroll", onScroll);
    };
  }, [targetId, sections.length]);

  const goTo = (index: number) => {
    const scroller = document.getElementById(targetId);
    scroller?.scrollTo({ left: index * scroller.clientWidth, behavior: "smooth" });
  };

  return (
    <div className="dash__dots" role="group" aria-label={member.dashboard.sectionsLabel}>
      <ul className="panels__dots">
        {sections.map((section, index) => (
          <li key={section.id}>
            <button
              type="button"
              className="panels__dot"
              aria-label={`Go to ${section.label}`}
              aria-current={index === active ? "true" : undefined}
              onClick={() => goTo(index)}
              data-sfx="none"
            >
              <span className="panels__dot-label">{section.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
