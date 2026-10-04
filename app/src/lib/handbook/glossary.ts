export interface TermPart {
  text: string;
  /** Present when this part is a glossary term. */
  definition?: string;
  key?: string;
}

interface Entry {
  key: string;
  pattern: string;
  definition: string;
}

/** Plain language definitions for inline terms. Short, no jargon, no hyphenated compounds. */
const ENTRIES: readonly Entry[] = [
  { key: "fungicide", pattern: "fungicides?", definition: "A product that kills or stops fungi." },
  {
    key: "pathogen",
    pattern: "pathogens?",
    definition: "A living organism or virus that causes disease.",
  },
  {
    key: "oomycete",
    pattern: "oomycetes?",
    definition: "A water mold. It behaves like a fungus but is a different kind of organism.",
  },
  {
    key: "spore",
    pattern: "spores?",
    definition: "A tiny seed like cell that fungi use to spread, often carried by wind or rain.",
  },
  {
    key: "lesion",
    pattern: "lesions?",
    definition: "A patch of damaged tissue, such as a spot on a leaf.",
  },
  {
    key: "chlorosis",
    pattern: "chlorosis|chlorotic",
    definition: "Yellowing of leaf tissue caused by a loss of green pigment.",
  },
  {
    key: "necrosis",
    pattern: "necrosis|necrotic",
    definition: "Dead tissue, usually brown or black.",
  },
  { key: "canker", pattern: "cankers?", definition: "A sunken, dead area on a stem or branch." },
  {
    key: "defoliation",
    pattern: "defoliation|defoliate[sd]?",
    definition: "Loss of leaves before the normal time.",
  },
  { key: "foliage", pattern: "foliage", definition: "The leaves of a plant." },
  {
    key: "inoculum",
    pattern: "inoculum",
    definition: "The source of infection, such as spores left on old leaves.",
  },
  {
    key: "vector",
    pattern: "vectors?",
    definition: "An insect or other carrier that moves a disease from plant to plant.",
  },
  {
    key: "overwinter",
    pattern: "overwinters?|overwintering|overwintered",
    definition: "To survive through the cold season, for example in soil or plant debris.",
  },
  {
    key: "cultivar",
    pattern: "cultivars?",
    definition: "A plant variety bred or selected for particular traits.",
  },
  {
    key: "blight",
    pattern: "blights?",
    definition: "Rapid browning and death of leaves, stems or other plant parts.",
  },
  {
    key: "mildew",
    pattern: "mildews?",
    definition: "A powdery or fuzzy fungal growth on the surface of leaves.",
  },
  {
    key: "mosaic",
    pattern: "mosaic",
    definition: "A mottled pattern of light and dark green on a leaf.",
  },
];

const MATCHER = new RegExp(
  `\\b(${ENTRIES.map((entry) => `(?:${entry.pattern})`).join("|")})\\b`,
  "gi",
);

const ENTRY_TESTS = ENTRIES.map((entry) => ({
  entry,
  test: new RegExp(`^(?:${entry.pattern})$`, "i"),
}));

function entryFor(word: string): Entry | undefined {
  return ENTRY_TESTS.find(({ test }) => test.test(word))?.entry;
}

/**
 * Splits text into plain parts and glossary terms. Pass the same `seen` set across the strings
 * of one panel so each term is explained only the first time it appears.
 */
export function annotateTerms(text: string, seen: Set<string> = new Set()): TermPart[] {
  const parts: TermPart[] = [];
  let cursor = 0;
  for (const match of text.matchAll(MATCHER)) {
    const word = match[0];
    const entry = entryFor(word);
    const start = match.index ?? 0;
    if (!entry || seen.has(entry.key)) continue;
    seen.add(entry.key);
    if (start > cursor) parts.push({ text: text.slice(cursor, start) });
    parts.push({ text: word, definition: entry.definition, key: entry.key });
    cursor = start + word.length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor) });
  return parts.length > 0 ? parts : [{ text }];
}
