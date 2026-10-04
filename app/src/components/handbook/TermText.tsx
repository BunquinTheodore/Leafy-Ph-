"use client";

import { annotateTerms } from "@/lib/handbook/glossary";
import { Tooltip } from "../interaction/Tooltip";

/**
 * Text with inline definition tooltips for glossary terms. Pass one `seen` set per panel so a
 * term is explained only the first time it appears. Tooltips open on hover and keyboard focus.
 */
export function TermText({ text, seen }: { text: string; seen?: Set<string> }) {
  const parts = annotateTerms(text, seen);
  return (
    <>
      {parts.map((part, index) =>
        part.definition ? (
          <Tooltip key={`${part.key}-${index}`} content={part.definition}>
            <button type="button" className="term" data-sfx="none">
              {part.text}
            </button>
          </Tooltip>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}
