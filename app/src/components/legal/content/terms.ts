import { CONTACT_PLACEHOLDER, DRAFT_NOTE, type LegalDocumentContent } from "./types";

export const termsContent: LegalDocumentContent = {
  eyebrow: "Legal",
  title: "Terms of Use",
  draftNote: DRAFT_NOTE,
  intro: "These terms explain, in plain words, how Leafy may be used. Jump to any section below.",
  sections: [
    {
      id: "about-these-terms",
      title: "About these terms",
      paragraphs: [
        "By creating an account or using Leafy you agree to these terms and to the Privacy Policy. If you do not agree, please do not use Leafy.",
        "The handbook can be read without an account. Scanning and history need one.",
      ],
    },
    {
      id: "your-account",
      title: "Your account",
      paragraphs: ["Please look after your account."],
      items: [
        "Give your own email address: it is how you sign in.",
        "Keep your password to yourself and tell us if you think someone else has it.",
        "One account is for one person.",
        "You can delete your account at any time from the account page.",
      ],
    },
    {
      id: "your-photos",
      title: "Your photos",
      paragraphs: [
        "Your photos stay yours. By uploading one you allow Leafy to store it privately and analyze it so we can show you a result.",
        "Only upload photos of plant leaves that you are allowed to share. Please avoid photos that show people.",
      ],
    },
    {
      id: "results-and-limits",
      title: "Results and limits",
      paragraphs: [
        "Leafy gives automated suggestions about what may be affecting a leaf. A suggestion can be wrong, and some photos cannot be read at all.",
        "Results and handbook text are general information, not professional agricultural advice. For decisions that matter, such as treating a whole crop, ask a local plant health expert.",
        "Analysis may sometimes be unavailable. When that happens we say so and you can try again later.",
      ],
    },
    {
      id: "fair-use",
      title: "Using Leafy fairly",
      paragraphs: ["To keep Leafy working for everyone, please do not do the following."],
      items: [
        "Try to break, probe or overload the service.",
        "Collect content in bulk with automated tools.",
        "Upload unlawful or harmful files.",
        "Use someone else's account.",
      ],
    },
    {
      id: "changes-and-contact",
      title: "Changes and contact",
      paragraphs: [
        "We may update these terms as Leafy grows. When we make an important change we will say so on this page.",
        `Questions can go to ${CONTACT_PLACEHOLDER}.`,
      ],
    },
  ],
};
