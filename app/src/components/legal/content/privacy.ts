import { CONTACT_PLACEHOLDER, DRAFT_NOTE, type LegalDocumentContent } from "./types";

export const privacyContent: LegalDocumentContent = {
  eyebrow: "Legal",
  title: "Privacy Policy",
  draftNote: DRAFT_NOTE,
  intro:
    "This page explains, in plain words, what we keep about you and why. Jump to any section below.",
  sections: [
    {
      id: "summary",
      title: "The short version",
      paragraphs: [
        "We collect only what we need to run your account and your scans. We do not sell your data and we do not use advertising or tracking tools.",
        "Your scan photos are private to you and are deleted when you delete the scan or your account.",
      ],
    },
    {
      id: "what-we-collect",
      title: "What we collect",
      paragraphs: ["When you use Leafy we keep the following."],
      items: [
        "Account details: your name and email address.",
        "Your password, stored only as a one way scramble that cannot be turned back into the password.",
        "Scans: the photo you upload, the result, the date, and any feedback you give on a result.",
        "Basic technical records such as your IP address, the time of a request and your browser type, used to keep Leafy secure and to limit abuse.",
      ],
    },
    {
      id: "scan-photos",
      title: "Your scan photos",
      paragraphs: [
        "Photos are stored privately. Only you can open them, through links that stop working after a few minutes. Before analysis we remove hidden details such as location from the photo.",
        "We do not use your photos to train models unless our team decides to, updates this policy first and tells you.",
        "Deleting a scan or your account removes the photo from storage. Cleanup can take a short while.",
      ],
    },
    {
      id: "cookies",
      title: "Cookies and storage",
      paragraphs: [
        "Leafy uses only the cookies it needs. Two sign in cookies keep you signed in and cannot be read by scripts on the page. A small theme cookie remembers light or dark mode.",
        "Your browser also stores your sound setting on your device. We set no advertising or tracking cookies.",
      ],
    },
    {
      id: "google-sign-in",
      title: "Google sign in",
      paragraphs: [
        "If you choose Continue with Google, Google tells us your name and your verified email address. We never see your Google password.",
        "If you already have a Leafy account with the same email, we link the two so you can use either way to sign in. Google, through its Firebase Authentication service, handles the sign in on its side under its own policy.",
      ],
    },
    {
      id: "your-choices",
      title: "Your choices",
      paragraphs: ["You are in control of your information."],
      items: [
        "Change your name or password in your account at any time.",
        "Delete a single scan, or delete your account and every scan with it.",
        "Ask us a question or request a copy of your data using the contact details below.",
      ],
    },
    {
      id: "contact",
      title: "Contact",
      paragraphs: [
        "Leafy does not send you any email. There are no verification, reset or notice emails, so your address is only used to sign you in.",
        `Questions about privacy can go to ${CONTACT_PLACEHOLDER}. We will update this page when the policy changes.`,
      ],
    },
  ],
};
