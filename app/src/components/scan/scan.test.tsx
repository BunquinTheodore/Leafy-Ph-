import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installMatchMedia } from "@/test-utils/dom";
import { cancelDelete, resetPendingDeletesForTests } from "@/lib/scans/pending-deletes";
import { parseScanDetail, parseScanPage, type ScanDetail } from "@/lib/scans/types";
import { Dropzone } from "./Dropzone";
import { HistoryCard, statusView } from "./HistoryCard";
import { ProgressPanel } from "./ProgressPanel";
import { buildResultPanels } from "./ResultPanels";

vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/scan",
  useRouter: () => ({ push: vi.fn() }),
}));

beforeEach(() => installMatchMedia(false));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const base = {
  id: "00000000-0000-4000-8000-000000000001",
  status: "completed",
  stage: null,
  failure_code: null,
  verdict: "healthy",
  confidence: "0.9",
  plant: { slug: "basil", name: "Basil" },
  disease: null,
  image_url: null,
  image_expires_at: null,
  created_at: "2026-10-03T10:00:00Z",
  updated_at: null,
  disease_detail: null,
  feedback: null,
};

const detail = (over: Record<string, unknown> = {}): ScanDetail =>
  parseScanDetail({ ...base, ...over }) as ScanDetail;

const diseaseDetail = (treatments: string[]) => ({
  slug: "early-blight",
  name: "Early Blight",
  display_name: "Early blight",
  plant: { slug: "tomato", name: "Tomato" },
  cause: "A fungus.",
  pathogen_type: "fungal",
  pathogen_name: null,
  severity: "Moderate",
  symptoms: ["One", "Two"],
  treatments,
  preventions: [],
  affected_species: [],
  images: [],
});

const file = (name: string, type = "image/jpeg") => new File([new Uint8Array(4)], name, { type });

describe("Dropzone", () => {
  it("hands the first chosen file to the caller", () => {
    const onFile = vi.fn();
    render(<Dropzone onFile={onFile} />);
    const input = screen.getByTestId("photo-input") as HTMLInputElement;
    expect(input.accept).toBe("image/jpeg,image/png,image/webp");
    fireEvent.change(input, { target: { files: [file("a.jpg"), file("b.jpg")] } });
    expect(onFile).toHaveBeenCalledTimes(1);
    expect((onFile.mock.calls[0]![0] as File).name).toBe("a.jpg");
  });

  it("accepts a dropped file and shows the drag state while hovering", () => {
    const onFile = vi.fn();
    render(<Dropzone onFile={onFile} />);
    const zone = screen.getByRole("group", { name: "Photo of a leaf" });
    fireEvent.dragOver(zone);
    expect(zone).toHaveAttribute("data-dragging", "true");
    expect(screen.getByText("Drop the photo to add it")).toBeInTheDocument();
    fireEvent.drop(zone, { dataTransfer: { files: [file("drop.png", "image/png")] } });
    expect(onFile).toHaveBeenCalledTimes(1);
    expect(zone).not.toHaveAttribute("data-dragging");
  });

  it("ignores drops and disables the buttons while it is busy", () => {
    const onFile = vi.fn();
    render(<Dropzone onFile={onFile} disabled />);
    fireEvent.drop(screen.getByRole("group"), { dataTransfer: { files: [file("a.jpg")] } });
    expect(onFile).not.toHaveBeenCalled();
    expect(screen.getByTestId("upload-photo")).toBeDisabled();
  });

  it("announces a problem with the last file", () => {
    render(<Dropzone onFile={vi.fn()} problem="That file type is not supported." />);
    expect(screen.getByRole("alert")).toHaveTextContent("not supported");
  });

  it("offers the rear camera only on touch screens", () => {
    installMatchMedia(true);
    render(<Dropzone onFile={vi.fn()} />);
    expect(screen.getByTestId("take-photo")).toBeInTheDocument();
    const camera = screen.getByTestId("camera-input");
    expect(camera).toHaveAttribute("capture", "environment");
  });
});

describe("ProgressPanel", () => {
  it("exposes a determinate progressbar and marks the current step", () => {
    render(<ProgressPanel step="uploading" uploadPercent={50} photoUrl={null} />);
    const bar = screen.getByRole("progressbar", { name: "Scan progress" });
    expect(bar).toHaveAttribute("aria-valuenow", "10");
    expect(bar).toHaveAttribute("aria-valuetext", expect.stringContaining("Uploading"));
    const steps = screen.getByRole("list", { name: "Scan steps" });
    const current = within(steps)
      .getAllByRole("listitem")
      .find((li) => li.getAttribute("aria-current") === "step");
    expect(current).toHaveTextContent("Uploading");
    expect(screen.getByTestId("progress-detail")).toHaveTextContent(
      "Uploading your photo, 10 percent",
    );
  });

  it("offers Cancel only while uploading", () => {
    const onCancel = vi.fn();
    const { rerender } = render(
      <ProgressPanel step="uploading" uploadPercent={5} photoUrl={null} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByTestId("cancel-upload"));
    expect(onCancel).toHaveBeenCalled();
    rerender(
      <ProgressPanel step="analyzing" uploadPercent={100} photoUrl={null} onCancel={onCancel} />,
    );
    expect(screen.queryByTestId("cancel-upload")).toBeNull();
    expect(screen.getByRole("link", { name: "Open History" })).toHaveAttribute("href", "/scans");
  });

  it("adds reassurance after eight seconds of analyzing and never shows 100 percent", () => {
    vi.useFakeTimers();
    render(<ProgressPanel step="analyzing" uploadPercent={100} photoUrl={null} />);
    expect(screen.queryByTestId("reassure")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(9000);
    });
    expect(screen.getByTestId("reassure")).toHaveTextContent("Still analyzing");
    const value = Number(screen.getByRole("progressbar").getAttribute("aria-valuenow"));
    expect(value).toBeGreaterThan(32);
    expect(value).toBeLessThan(90);
    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(Number(screen.getByRole("progressbar").getAttribute("aria-valuenow"))).toBeLessThan(90);
  });

  it("reaches 100 only on done, and the bar never moves backwards", () => {
    const { rerender } = render(
      <ProgressPanel step="saving" uploadPercent={100} photoUrl={null} />,
    );
    const saving = Number(screen.getByRole("progressbar").getAttribute("aria-valuenow"));
    rerender(<ProgressPanel step="checking" uploadPercent={100} photoUrl={null} />);
    expect(
      Number(screen.getByRole("progressbar").getAttribute("aria-valuenow")),
    ).toBeGreaterThanOrEqual(saving);
    rerender(<ProgressPanel step="done" uploadPercent={100} photoUrl={null} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });
});

describe("result panels", () => {
  const ids = (scan: ScanDetail, size = 6) => buildResultPanels(scan, null, size).map((p) => p.id);

  it("a disease gets the full set, with long lists continued in another panel", () => {
    const scan = detail({
      verdict: "disease",
      disease: {
        slug: "early-blight",
        name: "Early Blight",
        display_name: "Early blight",
        severity: "Moderate",
      },
      disease_detail: diseaseDetail(["1", "2", "3", "4", "5", "6", "7"]),
    });
    expect(ids(scan)).toEqual([
      "result",
      "causes",
      "symptoms",
      "treatment",
      "treatment-2",
      "photos",
    ]);
    expect(ids(scan, 4)).toContain("treatment-2");
  });

  it("healthy leaves get care tips and unclear ones get a retake guide", () => {
    expect(ids(detail())).toEqual(["result", "care"]);
    expect(ids(detail({ verdict: "unknown", plant: null }))).toEqual(["result", "retake"]);
  });

  it("a disease without handbook notes does not leave a dead end", () => {
    const scan = detail({
      verdict: "disease",
      disease: { slug: "x", name: "X", display_name: null, severity: null },
    });
    expect(ids(scan)).toEqual(["result", "notes"]);
  });
});

describe("history card", () => {
  const page = parseScanPage({
    items: [
      { ...base, id: "a", status: "processing", stage: "analyzing", verdict: null, plant: null },
      { ...base, id: "b", status: "failed", verdict: null, failure_code: "ml_unavailable" },
      { ...base, id: "c", verdict: "unknown", plant: null },
      {
        ...base,
        id: "d",
        verdict: "disease",
        disease: {
          slug: "early-blight",
          name: "Early Blight",
          display_name: "Early blight",
          severity: "High",
        },
      },
    ],
    next_cursor: null,
  })!;

  it("maps each state to a labelled status, never colour only", () => {
    const [live, failed, unclear, disease] = page.items.map(statusView);
    expect(live).toMatchObject({ label: "Analyzing", detail: "Analyzing leaf" });
    expect(failed).toMatchObject({ label: "Failed", detail: "Analysis isn't available right now" });
    expect(unclear).toMatchObject({ label: "Unclear" });
    expect(disease).toMatchObject({ label: "Disease found", detail: "Early blight", tone: "high" });
  });

  it("shows a live progress bar only for a running scan and deletes on request", () => {
    const onDelete = vi.fn();
    const { rerender } = render(<HistoryCard scan={page.items[0]!} onDelete={onDelete} />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    rerender(<HistoryCard scan={page.items[3]!} onDelete={onDelete} />);
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/scans/d");
    fireEvent.click(screen.getByTestId("history-delete"));
    expect(onDelete).toHaveBeenCalledWith(page.items[3]);
  });
});

describe("pending deletes", () => {
  it("undo of an unknown id reports false", () => {
    resetPendingDeletesForTests();
    expect(cancelDelete("nothing")).toBe(false);
  });
});
