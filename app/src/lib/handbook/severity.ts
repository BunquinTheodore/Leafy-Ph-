export type SeverityLevel = "low" | "moderate" | "high" | "severe";

const LEVELS: ReadonlyArray<{ level: SeverityLevel; words: RegExp }> = [
  { level: "severe", words: /\bsevere\b/i },
  { level: "high", words: /\bhigh\b/i },
  { level: "moderate", words: /\bmoderate\b/i },
  { level: "low", words: /\b(low|mild)\b/i },
];

const BRIEF_MAX_LENGTH = 70;

/** The severity sentence when it is short enough for a fact row; longer text moves to the Causes panel. */
export function severityBrief(text: string | null | undefined): string | null {
  const trimmed = text?.trim();
  return trimmed && trimmed.length <= BRIEF_MAX_LENGTH ? trimmed : null;
}

/**
 * The API ships severity as a sentence ("Moderate to severe, depending on weather"). The badge
 * uses the highest level named in the first clause, so later caveats ("can become severe in
 * susceptible plants") do not inflate it. Returns null when no level is named.
 */
export function severityLevel(text: string | null | undefined): SeverityLevel | null {
  if (!text) return null;
  const firstClause = text.split(/[;.,]/)[0] ?? "";
  for (const { level, words } of LEVELS) {
    if (words.test(firstClause)) return level;
  }
  return null;
}
