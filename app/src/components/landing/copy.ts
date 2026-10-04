/** Landing copy. Calm, plain, English only, no exclamation marks. */
export const landingCopy = {
  panels: {
    hero: "Welcome",
    how: "How it works",
    plants: "Plants",
    why: "Why Leafy",
    faq: "Questions",
    start: "Start",
  },
  how: {
    eyebrow: "How it works",
    title: "From leaf to answer in three steps",
    steps: [
      {
        title: "Take a photo",
        body: "Hold one leaf flat in daylight and take a close photo, or upload one you already have.",
      },
      {
        title: "Let Leafy look",
        body: "Leafy checks the image, looks for signs of disease and shows its progress while it works.",
      },
      {
        title: "Know what to do next",
        body: "Read the cause, the symptoms and the steps for treatment and prevention in plain words.",
      },
    ],
  },
  plants: {
    eyebrow: "Plants we cover",
    openHandbook: "Open the handbook",
    unavailableTitle: "The handbook is taking a moment",
    unavailableBody: "We could not load the plant list just now. Open the handbook to try again.",
  },
  why: {
    eyebrow: "Why Leafy",
    title: "Clear answers you can act on",
    reasons: [
      {
        title: "Plain language",
        body: "Every disease is explained in everyday words, with a short definition for each technical term.",
      },
      {
        title: "A handbook you can check",
        body: "Causes, symptoms, treatment and prevention for each disease, open to everyone without an account.",
      },
      {
        title: "Private by default",
        body: "Your scan photos are stored privately and are deleted when you delete your account.",
      },
      {
        title: "Honest about doubt",
        body: "When a photo is unclear, Leafy says so and shows how to retake it instead of guessing.",
      },
    ],
  },
  faq: {
    eyebrow: "Questions",
    title: "Good questions, short answers",
  },
  start: {
    title: "Ready to read a leaf?",
    primary: "Scan a leaf",
    secondary: "Browse the handbook",
  },
} as const;

export interface FaqItem {
  question: string;
  answer: string;
}

/** The plants answer reads the live catalog so the count never drifts from the data. */
export function faqItems(plantNames: readonly string[]): FaqItem[] {
  const covered =
    plantNames.length > 0
      ? `The handbook covers ${plantNames.length} plants today, including ${plantNames.slice(0, 4).join(", ")}.`
      : "The handbook covers the crops and garden plants growers ask about most.";
  return [
    {
      question: "What can Leafy tell me?",
      answer:
        "Leafy looks at a photo of one leaf. It tells you whether the leaf shows signs of a known disease, looks healthy, or is too unclear to say. Each answer links to the handbook.",
    },
    { question: "Which plants are covered?", answer: covered },
    {
      question: "Do I need an account?",
      answer:
        "You can read the whole handbook without one. An account is needed to scan a leaf and to keep your scan history.",
    },
    {
      question: "Are my photos private?",
      answer:
        "Scan photos are stored privately and are visible only to you. They are removed when you delete the scan or your account.",
    },
    {
      question: "How should I photograph a leaf?",
      answer:
        "Use daylight, hold one leaf flat and fill the frame. Avoid shadows, glare and heavy filters.",
    },
    {
      question: "Can I rely on the result?",
      answer:
        "Leafy offers guidance, not a diagnosis. For a valuable crop or a fast spreading problem, confirm with a local agricultural extension service.",
    },
  ];
}
