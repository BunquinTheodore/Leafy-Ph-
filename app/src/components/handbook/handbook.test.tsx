import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { buildSearchIndex } from "@/lib/handbook/search";
import type { DiseaseDetail, DiseaseSummary, PlantSummary } from "@/lib/handbook/types";
import { chunk } from "./CatalogRail";
import { chunkItems, DiseaseView, samePlan } from "./DiseaseView";
import { HandbookBrowser } from "./HandbookBrowser";
import { lensBackground, MagnifierImage } from "./MagnifierImage";
import { balancedChunk } from "./PlantPanels";
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

describe("balancedChunk", () => {
  it("makes pages of nearly equal size, so the last page is not a short row", () => {
    const nine = Array.from({ length: 9 }, (_, index) => index);
    expect(balancedChunk(nine, 6).map((page) => page.length)).toEqual([5, 4]);
    expect(balancedChunk(nine.slice(0, 3), 6).map((page) => page.length)).toEqual([3]);
    expect(balancedChunk([...nine, 9, 10, 11], 6).map((page) => page.length)).toEqual([6, 6]);
    expect(balancedChunk([], 6)).toEqual([]);
  });
});

describe("lensBackground", () => {
  const frame = { left: 100, top: 50, width: 300, height: 200 };

  it("centers the point under the cursor in the lens at the zoom level", () => {
    // Same 3:2 shape as the frame, so the photo fills it exactly.
    const lens = lensBackground(frame, { width: 600, height: 400 }, { x: 250, y: 150 });
    expect(lens).toEqual({ size: "750px 500px", position: "-300px -175px" });
  });

  it("accounts for object-fit cover on a photo that is wider than the frame", () => {
    // 900x400 scales by 0.5 to 450x200: 75px of the width is cropped on each side.
    const lens = lensBackground(frame, { width: 900, height: 400 }, { x: 100, y: 50 });
    expect(lens).toEqual({ size: "1125px 500px", position: "-112.5px 75px" });
  });

  it("hides the lens outside the frame or before the photo has a size", () => {
    expect(lensBackground(frame, { width: 600, height: 400 }, { x: 50, y: 150 })).toBeNull();
    expect(lensBackground(frame, { width: 0, height: 0 }, { x: 250, y: 150 })).toBeNull();
  });
});

describe("MagnifierImage", () => {
  it("shows a lens for a mouse and hides it on leave", () => {
    render(<MagnifierImage src="/x.jpg" alt="Spots on a leaf" />);
    const figure = screen.getByRole("figure");
    const image = screen.getByAltText("Spots on a leaf");
    Object.defineProperty(image, "naturalWidth", { value: 600 });
    Object.defineProperty(image, "naturalHeight", { value: 400 });
    figure.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100 }) as DOMRect;
    (figure.querySelector(".shot__frame") as HTMLElement).getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 300, height: 200, right: 300, bottom: 200 }) as DOMRect;
    fireEvent.pointerMove(figure, { pointerType: "mouse", clientX: 150, clientY: 100 });
    const lens = screen.getByTestId("lens");
    expect(lens.style.backgroundSize).toBe("750px 500px");
    expect(lens.style.backgroundPosition).toBe("-300px -175px");
    fireEvent.pointerLeave(figure);
    expect(screen.queryByTestId("lens")).toBeNull();
  });

  it("falls back to the bundled photo with its own credit, then to a quiet icon", () => {
    render(
      <MagnifierImage
        src="/storage.jpg"
        alt="Rings on a leaf"
        caption="Stored photo"
        fallback={{ src: "/bundled.jpg", alt: "Bundled rings", caption: "Photo: Someone, CC BY" }}
      />,
    );
    fireEvent.error(screen.getByAltText("Rings on a leaf"));
    expect(screen.getByAltText("Bundled rings")).toBeInTheDocument();
    expect(screen.getByText("Photo: Someone, CC BY")).toBeInTheDocument();
    expect(screen.queryByText("Stored photo")).toBeNull();
    fireEvent.error(screen.getByAltText("Bundled rings"));
    expect(screen.queryByAltText("Bundled rings")).toBeNull();
    expect(screen.getByRole("img", { name: "Rings on a leaf" })).toBeInTheDocument();
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
    render(
      <DiseaseView
        disease={detail({ plant: { slug: "cherry", name: "Cherry" }, slug: "powdery-mildew" })}
      />,
    );
    expect(screen.getByText("Reference photos coming soon")).toBeInTheDocument();
  });

  it("falls back to the bundled credited photos when the API has none", () => {
    const { container } = render(<DiseaseView disease={detail()} />);
    const images = within(container.querySelector("#images") as HTMLElement);
    expect(images.getAllByAltText("Early Blight on Tomato").length).toBeGreaterThan(0);
    expect(images.getAllByText(/^Photo: .+, .+/).length).toBeGreaterThan(0);
    expect(images.queryByText("Reference photos coming soon")).toBeNull();
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
    const related = buildSearchIndex([], [summary("cherry", "Cherry", "Late Blight")]);
    const noPhotos = detail({ plant: { slug: "cherry", name: "Cherry" }, slug: "powdery-mildew" });
    render(<DiseaseView disease={noPhotos} related={related} />);
    expect(screen.getByRole("link", { name: /Late Blight/ })).toBeInTheDocument();
  });
});
