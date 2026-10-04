import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { aboutSections } from "./content/about";
import { privacyContent } from "./content/privacy";
import { ContentsPanel, DocumentPage } from "./DocumentPage";

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
});

afterEach(cleanup);

function renderPrivacy() {
  const doc = privacyContent;
  return render(
    <DocumentPage
      label="Privacy Policy sections"
      eyebrow={doc.eyebrow}
      title={doc.title}
      draftNote={doc.draftNote}
      lead={{
        title: "Contents",
        content: (
          <ContentsPanel intro={doc.intro} draftNote={doc.draftNote} sections={doc.sections} />
        ),
      }}
      sections={doc.sections}
    />,
  );
}

describe("DocumentPage", () => {
  it("has exactly one h1 and marks the page as a draft", () => {
    renderPrivacy();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Privacy Policy");
    expect(screen.getByText("Draft for review")).toBeInTheDocument();
  });

  it("puts a contents panel first and one panel per section", () => {
    renderPrivacy();
    const carousel = screen.getByRole("region", { name: "Privacy Policy sections" });
    const slides = within(carousel).getAllByRole("group", { hidden: true });
    expect(slides).toHaveLength(privacyContent.sections.length + 1);
    expect(slides[0]).toHaveAttribute("id", "contents");
  });

  it("links every section from the contents list with a hash", () => {
    renderPrivacy();
    const nav = screen.getByRole("navigation", { name: "Contents" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(
      privacyContent.sections.map((section) => `#${section.id}`),
    );
  });

  it("renders About without a draft marker", () => {
    render(
      <DocumentPage
        label="About Leafy sections"
        eyebrow="About"
        title="About Leafy"
        sections={aboutSections}
      />,
    );
    expect(screen.queryByText("Draft for review")).not.toBeInTheDocument();
    expect(screen.getAllByText(/Dahon means leaf in Filipino/).length).toBeGreaterThan(0);
  });
});
