/** Handbook copy. Calm, plain, English only, no exclamation marks. */
export const handbookCopy = {
  index: {
    eyebrow: "Handbook",
    title: "Plant handbook",
    lede: "Look up a plant or a disease. Every page is written in plain words and open to everyone.",
    searchLabel: "Search plants and diseases",
    searchPlaceholder: "Search plants and diseases",
    clearSearch: "Clear search",
    railLabel: "Plants",
    resultsLabel: "Search results",
    noMatchTitle: "No matches",
    noMatchBody: "Try a plant name such as tomato, or a disease such as blight.",
  },
  plant: {
    overview: "Overview",
    diseases: "Diseases",
    growth: "Growth conditions",
    soil: "Soil",
    light: "Light",
    water: "Water",
    temperature: "Temperature",
    noDiseasesTitle: "No diseases catalogued yet",
    noDiseasesBody: "This plant is in the handbook, but its diseases have not been added yet.",
    browseOthers: "Browse other plants",
  },
  disease: {
    ctaQuestion: "Think your plant has this?",
    ctaAction: "Scan a leaf",
    treatmentNote:
      "General guidance only. For a valuable crop or a fast spreading problem, check with a local agricultural extension service.",
    imagesTitle: "Reference photos coming soon",
    imagesBody:
      "We are collecting clear photos of this disease on leaves. Until then, compare your plant with the symptoms listed.",
    readSymptoms: "Read the symptoms",
  },
  errors: {
    title: "The handbook is not available right now",
    body: "We could not load this page. Check your connection and try again.",
    retry: "Try again",
    notFoundTitle: "We could not find that page",
    notFoundBody: "The plant or disease may have moved. Browse the handbook to find it.",
  },
} as const;

const PATHOGEN_PHRASES: Readonly<Record<string, string>> = {
  fungal: "caused by a fungus",
  fungus: "caused by a fungus",
  bacterium: "caused by bacteria",
  bacterial: "caused by bacteria",
  viral: "caused by a virus",
  virus: "caused by a virus",
  oomycete: "caused by an oomycete, a kind of water mold",
  pest: "caused by a pest",
};

/** A plain sentence for the Causes panel, built only from fields in the catalog. */
export function causeSentence(
  name: string,
  plantName: string,
  pathogenType: string | null,
  pathogenName: string | null,
): string {
  const phrase = pathogenType ? PATHOGEN_PHRASES[pathogenType.toLowerCase()] : undefined;
  const subject = name.toLowerCase().startsWith(plantName.toLowerCase())
    ? name
    : `${name} on ${plantName}`;
  if (!phrase)
    return subject === name
      ? `${name} is a known disease of ${plantName}.`
      : `${subject} is a known disease.`;
  // A virus is often named after itself ("Tomato yellow leaf curl virus"); do not repeat it.
  const repeatsName = pathogenName ? name.toLowerCase() === pathogenName.toLowerCase() : true;
  const agent = pathogenName && !repeatsName ? `, ${pathogenName}` : "";
  return `${subject} is ${phrase}${agent}.`;
}
