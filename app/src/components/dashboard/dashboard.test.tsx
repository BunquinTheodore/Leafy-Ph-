import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installMatchMedia, okEnvelope, stubFetch } from "@/test-utils/dom";
import type { DashboardStats, ScanSummary } from "./data";
import { DashboardView } from "./DashboardView";
import { RecentScans } from "./RecentScans";
import { ScanCard, statusFor } from "./ScanCard";

vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));

const stats: DashboardStats = {
  total: 12,
  last30Days: 5,
  healthy: 7,
  diseased: 4,
  unknown: 1,
  topDiseases: [
    { name: "Early blight", plantName: "Tomato", count: 3 },
    { name: "Leaf scorch", plantName: "Apple", count: 1 },
  ],
};

const scan = (over: Partial<ScanSummary> = {}): ScanSummary => ({
  id: "s1",
  status: "completed",
  stage: null,
  failureCode: null,
  verdict: "healthy",
  plantName: "Basil",
  diseaseName: null,
  confidence: null,
  createdAt: "2026-10-01T10:00:00Z",
  imageUrl: null,
  ...over,
});

beforeEach(() => installMatchMedia(false));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("statusFor", () => {
  it("describes processing scans by stage", () => {
    expect(statusFor(scan({ status: "processing", stage: "analyzing" }))).toMatchObject({
      label: "Analyzing",
      detail: "Analyzing leaf",
    });
    expect(statusFor(scan({ status: "processing", stage: "validating" })).detail).toBe(
      "Checking image",
    );
  });

  it("tells the truth when analysis is unavailable", () => {
    expect(statusFor(scan({ status: "failed", failureCode: "ml_unavailable" }))).toMatchObject({
      label: "Failed",
      detail: "Analysis isn't available right now",
    });
  });

  it("names the disease for a disease verdict and says Healthy for healthy", () => {
    expect(statusFor(scan({ verdict: "disease", diseaseName: "Early blight" }))).toMatchObject({
      label: "Disease found",
      detail: "Early blight",
    });
    expect(statusFor(scan()).label).toBe("Healthy");
    expect(statusFor(scan({ verdict: "unknown" })).label).toBe("Unclear");
  });
});

describe("ScanCard", () => {
  it("links to the scan and shows plant, badge and date", () => {
    render(
      <ul>
        <ScanCard scan={scan({ id: "abc" })} />
      </ul>,
    );
    const link = screen.getByRole("link", { name: /Basil.*Healthy/ });
    expect(link).toHaveAttribute("href", "/scans/abc");
    expect(within(link).getByText("Healthy")).toBeInTheDocument();
    expect(within(link).getByText("Oct 1")).toBeInTheDocument();
  });

  it("shows a live progress bar while processing", () => {
    render(
      <ul>
        <ScanCard scan={scan({ status: "processing", verdict: null, stage: "saving" })} />
      </ul>,
    );
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Analyzing");
  });
});

describe("RecentScans", () => {
  it("shows an empty message without scans", () => {
    render(<RecentScans initial={[]} />);
    expect(screen.getByText("Your scans will appear here.")).toBeInTheDocument();
  });

  it("polls while a scan is processing and stops once it is done", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let calls = 0;
    const { mock } = stubFetch(() => {
      calls += 1;
      return okEnvelope({
        items: [
          {
            id: "s1",
            status: "completed",
            verdict: "disease",
            plant_name: "Tomato",
            disease_name: "Early blight",
            created_at: "2026-10-01T10:00:00Z",
          },
        ],
      });
    });
    render(
      <RecentScans
        initial={[scan({ status: "processing", verdict: null, plantName: "Tomato" })]}
      />,
    );
    expect(screen.getByRole("progressbar")).toBeInTheDocument();

    await act(async () => undefined);
    await act(async () => {
      vi.advanceTimersByTime(2100);
    });
    await waitFor(() => expect(screen.getByText("Disease found")).toBeInTheDocument());
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(String(mock.mock.calls[0]?.[0])).toBe("/api/scans?limit=8");

    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });
    expect(calls).toBe(1);
  });

  it("does not poll when nothing is processing", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { mock } = stubFetch(() => okEnvelope([]));
    render(<RecentScans initial={[scan()]} />);
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    expect(mock).not.toHaveBeenCalled();
  });
});

describe("DashboardView", () => {
  const view = (over: Partial<Parameters<typeof DashboardView>[0]> = {}) =>
    render(<DashboardView firstName="Ada" verified stats={stats} scans={[scan()]} {...over} />);

  it("shows the totals, the split, the top diseases and the recent scans", () => {
    view();
    expect(screen.getByRole("heading", { level: 1, name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByText("Welcome back, Ada")).toBeInTheDocument();
    expect(screen.getByText("Total scans").nextElementSibling).toHaveTextContent("12");
    expect(screen.getByText("Last 30 days").nextElementSibling).toHaveTextContent("5");

    const split = screen.getByTestId("result-split");
    expect(within(split).getByText("Healthy").closest("li")).toHaveTextContent("7");
    expect(within(split).getByText("Disease found").closest("li")).toHaveTextContent("33%");
    expect(within(split).getByText(/7 healthy, 4 with a disease, 1 unclear/)).toBeInTheDocument();

    const top = screen.getByTestId("top-diseases");
    expect(within(top).getAllByRole("listitem")).toHaveLength(2);
    expect(within(top).getByText("Early blight")).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "Scan a leaf" })).toHaveAttribute("href", "/scan");
    expect(screen.getByRole("link", { name: "See all scans" })).toHaveAttribute("href", "/scans");
  });

  it("guides a member with no scans to the first scan", () => {
    view({
      stats: { ...stats, total: 0, healthy: 0, diseased: 0, unknown: 0, topDiseases: [] },
      scans: [],
    });
    expect(screen.getByRole("heading", { name: "Scan your first leaf" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Scan a leaf/ })).toHaveLength(1);
    expect(screen.queryByTestId("result-split")).not.toBeInTheDocument();
  });

  it("explains why Scan is unavailable until the email is verified", () => {
    view({ verified: false });
    expect(screen.queryByRole("link", { name: "Scan a leaf" })).not.toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Scan a leaf" });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription("Verify your email to scan");
  });

  it("says so, with a reload, when the summary could not load", () => {
    view({ stats: null, scans: [] });
    expect(screen.getByText("We could not load your summary")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reload" })).toHaveAttribute("href", "/dashboard");
  });

  it("handles a top disease list that is empty", () => {
    view({ stats: { ...stats, topDiseases: [] } });
    expect(screen.getByText("No diseases found yet. That is good news.")).toBeInTheDocument();
  });
});
