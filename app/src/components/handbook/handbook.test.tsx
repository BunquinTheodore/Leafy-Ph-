import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { buildSearchIndex } from "@/lib/handbook/search";
import type { DiseaseDetail, DiseaseSummary, PlantSummary } from "@/lib/handbook/types";
import { chunk } from "./CatalogRail";
import { chunkItems, DiseaseView, samePlan } from "./DiseaseView";
import { HandbookBrowser } from "./HandbookBrowser";
import { MagnifierImage } from "./MagnifierImage";
import { SeverityBadge } from "./SeverityBadge";
import { Suggestions } from "./Suggestions";
import { TermText } from "./TermText";

beforeAll(() => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("min-width"),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  Element.prototype.scrollTo = () => undefined;
});

const plant = (slug: string, name: string, count = 0): PlantSummary => ({
  slug,
  name,
  scientific_name: null,
  family: null,
  plant_type: null,
  image_url: null,
  image_alt: null,
  disease_count: count,
});

const summary = (plantSlug: string, plantName: string, name: string): DiseaseSummary => ({
  slug: name.toLowerCase().replace(/\s+/g, "-"),
  plant_slug: plantSlug,
  plant_name: plantName,
  name,
  display_name: name,
  pathogen_type: "fungal",
  severity: "High; can cause losses",
});

const detail = (overrides: Partial<DiseaseDetail> = {}): DiseaseDetail => ({
  slug: "early-blight",
  name: "Early Blight",
  display_name: "Early Blight",
  plant: { slug: "tomato", name: "Tomato" },
  cause: "Fungal (Alternaria solani)",
  pathogen_type: "fungal",
  pathogen_name: "Alternaria solani",
  severity: "High; can cause losses",
  symptoms: ["Dark spots on older leaves"],
  treatments: ["Remove infected foliage"],
  preventions: ["Rotate crops"],
  affected_species: ["Potato"],
  images: [],
  ...overrides,
});

describe("chunk helpers", () => {
  it("splits lists into pages of the given size", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkItems([], 6)).toEqual([]);
    expect(chunkItems([1, 2, 3, 4, 5, 6, 7], 6)).toEqual([[1, 2, 3, 4, 5, 6], [7]]);
  });
});

describe("MagnifierImage", () => {
  it("shows a lens for a mouse and hides it on leave", () => {
    render(<MagnifierImage src="/x.jpg" alt="Spots on a leaf" />);
    const figure = screen.getByRole("figure");
    figure.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100 }) as DOMRect;
    fireEvent.pointerMove(figure, { pointerType: "mouse", clientX: 100, clientY: 50 });
    const lens = screen.getByTestId("lens");
    expect(lens.style.backgroundPosition).toBe("50% 50%");
    fireEvent.pointerLeave(figure);
    expect(screen.queryByTestId("lens")).toBeNull();
  });

  it("ignores touch and pen pointers", () => {
    render(<MagnifierImage src="/x.jpg" alt="Spots on a leaf" />);
    fireEvent.pointerMove(screen.getByRole("figure"), {
      pointerType: "touch",
      clientX: 5,
      clientY: 5,
    });
    expect(screen.queryByTestId("lens")).toBeNull();
  });
});

describe("TermText", () => {
  it("makes a focusable term and shows its definition on focus", () => {
    render(
      <p>
        <TermText text="Apply a fungicide weekly." seen={new Set()} />
      </p>,
    );
    const term = screen.getByRole("button", { name: "fungicide" });
    fireEvent.focus(term);
    expect(screen.getByRole("tooltip")).toHaveTextContent("kills or stops fungi");
  });
});

describe("HandbookBrowser", () => {
  const index = buildSearchIndex(
    [plant("tomato", "Tomato", 2), plant("potato", "Potato", 1), plant("blueberry", "Blueberry")],
    [
      summary("tomato", "Tomato", "Early Blight"),
      summary("tomato", "Tomato", "Late Blight"),
      summary("potato", "Potato", "Early Blight"),
    ],
  );

  it("lists plants first, with a link to each plant page", () => {
    render(<HandbookBrowser index={index} />);
    expect(screen.getByRole("heading", { level: 1, name: "Plant handbook" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /tomato/i })).toHaveAttribute(
      "href",
      "/handbook/tomato",
    );
    expect(screen.getByText("No diseases catalogued yet")).toBeInTheDocument();
  });

  it("searches plants and diseases together with plant scoped links", () => {
    render(<HandbookBrowser index={index} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "potato blight" } });
    const link = screen.getByRole("link", { name: /early blight/i });
    expect(link).toHaveAttribute("href", "/handbook/potato/early-blight");
    expect(screen.getByRole("status")).toHaveTextContent("1 results");
  });

  it("shows a calm empty state and clears the search", () => {
    render(<HandbookBrowser index={index} initialQuery="zzzz" />);
    expect(screen.getByRole("heading", { name: "No matches" })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Clear search" })[0]!);
    expect(screen.queryByRole("heading", { name: "No matches" })).toBeNull();
    expect(screen.getByRole("searchbox")).toHaveValue("");
  });
});

describe("DiseaseView", () => {
  it("renders the six panels with hash ids", () => {
    const { container } = render(<DiseaseView disease={detail()} />);
    const ids = [...container.querySelectorAll(".panels__panel")].map((node) => node.id);
    expect(ids).toEqual(["overview", "causes", "symptoms", "treatment", "prevention", "images"]);
  });

  it("moves list items beyond the panel budget to another panel", () => {
    const many = Array.from({ length: 8 }, (_, index) => `Symptom number ${index + 1}`);
    const { container } = render(<DiseaseView disease={detail({ symptoms: many })} />);
    const ids = [...container.querySelectorAll(".panels__panel")].map((node) => node.id);
    expect(ids).toContain("symptoms");
    expect(ids).toContain("symptoms-2");
  });

  it("shows the graceful empty state when there are no reference photos", () => {
    render(<DiseaseView disease={detail()} />);
    expect(screen.getByText("Reference photos coming soon")).toBeInTheDocument();
  });

  it("shows reference photos with a lens when images exist", () => {
    const disease = detail({
      images: [{ url: "https://img.example/leaf.jpg", alt_text: "Rings on a tomato leaf" }],
    });
    const { container } = render(<DiseaseView disease={disease} />);
    const images = within(container.querySelector("#images") as HTMLElement);
    expect(images.getByAltText("Rings on a tomato leaf")).toBeInTheDocument();
    expect(images.queryByText("Reference photos coming soon")).toBeNull();
  });

  it("labels severity with words and an icon, never color alone", () => {
    render(<SeverityBadge severity="High; can cause losses" />);
    expect(screen.getByText("Severity: High")).toBeInTheDocument();
  });

  it("states the severity once: the overview row keeps only the explanation", () => {
    const { container } = render(<DiseaseView disease={detail()} />);
    const overview = within(container.querySelector("#overview") as HTMLElement);
    expect(overview.getByText("High; can cause losses")).toBeInTheDocument();
    expect(overview.queryByText("High")).toBeNull();
    expect(overview.queryByText("Severity: High")).toBeNull();
  });

  it("leaves out a prevention panel that repeats the treatment", () => {
    const steps = ["Remove infected leaves", "Water at the base"];
    const { container } = render(
      <DiseaseView disease={detail({ treatments: steps, preventions: [...steps] })} />,
    );
    const ids = [...container.querySelectorAll(".panels__panel")].map((node) => node.id);
    expect(ids).toContain("treatment");
    expect(ids).not.toContain("prevention");
    expect(samePlan(steps, ["Other"])).toBe(false);
  });
});

describe("Suggestions", () => {
  it("offers related cards as links under an empty state", () => {
    const entries = buildSearchIndex([plant("apple", "Apple", 3)], []);
    render(<Suggestions entries={entries} label="Other plants" />);
    const list = screen.getByRole("list", { name: "Other plants" });
    expect(within(list).getByRole("link", { name: /Apple/ })).toHaveAttribute(
      "href",
      "/handbook/apple",
    );
  });

  it("renders nothing when there is nothing to suggest", () => {
    const { container } = render(<Suggestions entries={[]} label="Other plants" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows related diseases when a disease has no photos", () => {
    const related = buildSearchIndex([], [summary("tomato", "Tomato", "Late Blight")]);
    render(<DiseaseView disease={detail()} related={related} />);
    expect(screen.getByRole("link", { name: /Late Blight/ })).toBeInTheDocument();
  });
});
