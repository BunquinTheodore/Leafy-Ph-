import { describe, expect, it, vi } from "vitest";
import { buildListQuery } from "./api";
import { defer } from "./deferred";
import { describeFailure, describeScanError } from "./errors";
import { MAX_CONSECUTIVE_FAILURES, pollDelay, pollScan, type ScanFetch } from "./polling";
import { easeToward, formatElapsed, monotonic, overallPercent, shouldReassure } from "./progress";
import { STEP_ORDER, stepFor } from "./stages";
import { parseScanDetail, parseScanPage, type ScanDetail } from "./types";
import { uploadScan, type UploadRequest } from "./upload";
import { checkDimensions, checkFile, MAX_FILE_BYTES } from "./validation";

const baseScan = {
  id: "00000000-0000-4000-8000-000000000001",
  status: "processing",
  stage: "analyzing",
  failure_code: null,
  verdict: null,
  confidence: null,
  plant: null,
  disease: null,
  image_url: "https://img.test/a.jpg",
  image_expires_at: "2026-10-04T10:10:00Z",
  created_at: "2026-10-04T10:00:00Z",
  updated_at: "2026-10-04T10:00:01Z",
  disease_detail: null,
  feedback: null,
};

describe("stepFor", () => {
  it("shows uploading while the browser is sending, whatever the scan says", () => {
    expect(stepFor({ uploading: true, scan: null })).toBe("uploading");
    expect(stepFor({ uploading: true, scan: { status: "processing", stage: "saving" } })).toBe(
      "uploading",
    );
  });

  it("maps the API stage to the stepper", () => {
    const at = (stage: "validating" | "analyzing" | "saving") =>
      stepFor({ uploading: false, scan: { status: "processing", stage } });
    expect(at("validating")).toBe("checking");
    expect(at("analyzing")).toBe("analyzing");
    expect(at("saving")).toBe("saving");
  });

  it("treats a processing scan without a stage as checking and a completed one as done", () => {
    expect(stepFor({ uploading: false, scan: { status: "processing", stage: null } })).toBe(
      "checking",
    );
    expect(stepFor({ uploading: false, scan: { status: "completed", stage: null } })).toBe("done");
  });

  it("keeps the five steps in the planned order", () => {
    expect(STEP_ORDER).toEqual(["uploading", "checking", "analyzing", "saving", "done"]);
  });
});

describe("progress easing", () => {
  it("approaches 1 but never reaches it", () => {
    expect(easeToward(0, 1000)).toBe(0);
    expect(easeToward(10_000, 1000)).toBeLessThan(1);
    expect(easeToward(-5, 1000)).toBe(0);
  });

  it("follows the real upload percentage", () => {
    const at = (uploadPercent: number) =>
      overallPercent({ step: "uploading", uploadPercent, stepElapsedMs: 0 });
    expect(at(0)).toBe(0);
    expect(at(50)).toBeCloseTo(10);
    expect(at(100)).toBeCloseTo(20);
    expect(at(500)).toBeCloseTo(20);
  });

  it("slows toward 90 while analyzing and never gets there", () => {
    const at = (ms: number) =>
      overallPercent({ step: "analyzing", uploadPercent: 100, stepElapsedMs: ms });
    expect(at(0)).toBeCloseTo(32);
    expect(at(5000)).toBeGreaterThan(at(1000));
    expect(at(10 * 60_000)).toBeLessThan(90);
  });

  it("only reaches 100 when the result is done", () => {
    for (const step of ["uploading", "checking", "analyzing", "saving"] as const) {
      expect(overallPercent({ step, uploadPercent: 100, stepElapsedMs: 10 * 60_000 })).toBeLessThan(
        100,
      );
    }
    expect(overallPercent({ step: "done", uploadPercent: 100, stepElapsedMs: 0 })).toBe(100);
  });

  it("is non decreasing across the steps", () => {
    const ends = (["uploading", "checking", "analyzing", "saving"] as const).map((step) =>
      overallPercent({ step, uploadPercent: 100, stepElapsedMs: 10 * 60_000 }),
    );
    expect([...ends].sort((a, b) => a - b)).toEqual(ends);
  });

  it("never moves backwards", () => {
    expect(monotonic(40, 35)).toBe(40);
    expect(monotonic(40, 45)).toBe(45);
  });

  it("reassures only while analyzing and only after 8 seconds", () => {
    expect(shouldReassure("analyzing", 7999)).toBe(false);
    expect(shouldReassure("analyzing", 8000)).toBe(true);
    expect(shouldReassure("saving", 20_000)).toBe(false);
  });

  it("formats elapsed time as m:ss", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(9_400)).toBe("0:09");
    expect(formatElapsed(125_000)).toBe("2:05");
  });
});

describe("polling", () => {
  it("starts at 1s and backs off to 2s", () => {
    expect(pollDelay(0)).toBe(1000);
    expect(pollDelay(4)).toBe(1000);
    expect(pollDelay(5)).toBe(1500);
    expect(pollDelay(10)).toBe(2000);
    expect(pollDelay(500)).toBe(2000);
    const delays = Array.from({ length: 20 }, (_, i) => pollDelay(i));
    expect([...delays].sort((a, b) => a - b)).toEqual(delays);
  });

  const scanOf = (over: Partial<ScanDetail>): ScanDetail =>
    parseScanDetail({ ...baseScan, ...over }) as ScanDetail;

  it("polls until the scan completes and sleeps with the backoff delays", async () => {
    const sleeps: number[] = [];
    const sequence = [
      scanOf({ stage: "validating" }),
      scanOf({ stage: "analyzing" }),
      scanOf({ status: "completed", stage: null, verdict: "healthy" }),
    ];
    let call = 0;
    const fetchScan: ScanFetch = async () => ({ ok: true, scan: sequence[call++]! });
    const updates: string[] = [];
    await pollScan({
      id: "x",
      fetchScan,
      signal: new AbortController().signal,
      onUpdate: (scan) => updates.push(scan.status),
      onError: () => updates.push("error"),
      sleep: async (ms) => void sleeps.push(ms),
    });
    expect(updates).toEqual(["processing", "processing", "completed"]);
    expect(sleeps).toEqual([1000, 1000, 1000]);
  });

  it("stops at once on a 404", async () => {
    const onError = vi.fn();
    const fetchScan: ScanFetch = async () => ({
      ok: false,
      error: { status: 404, code: "not_found", message: "", details: null },
    });
    await pollScan({
      id: "x",
      fetchScan,
      signal: new AbortController().signal,
      onUpdate: vi.fn(),
      onError,
      sleep: async () => undefined,
    });
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("tolerates a few failures, then reports the error", async () => {
    const onError = vi.fn();
    let calls = 0;
    const fetchScan: ScanFetch = async () => {
      calls += 1;
      return {
        ok: false,
        error: { status: 503, code: "api_unreachable", message: "", details: null },
      };
    };
    await pollScan({
      id: "x",
      fetchScan,
      signal: new AbortController().signal,
      onUpdate: vi.fn(),
      onError,
      sleep: async () => undefined,
    });
    expect(calls).toBe(MAX_CONSECUTIVE_FAILURES);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("stops quietly when aborted", async () => {
    const controller = new AbortController();
    const onUpdate = vi.fn();
    const fetchScan: ScanFetch = async () => {
      controller.abort();
      return { ok: true, scan: scanOf({}) };
    };
    await pollScan({
      id: "x",
      fetchScan,
      signal: controller.signal,
      onUpdate,
      onError: vi.fn(),
      sleep: async () => undefined,
    });
    expect(onUpdate).not.toHaveBeenCalled();
  });
});

describe("upload", () => {
  class FakeRequest implements UploadRequest {
    status = 0;
    responseText = "";
    timeout = 0;
    upload: UploadRequest["upload"] = { onprogress: null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    ontimeout: (() => void) | null = null;
    headers: Record<string, string> = {};
    sent: FormData | null = null;
    open = vi.fn();
    setRequestHeader = vi.fn();
    getResponseHeader = (name: string) => this.headers[name] ?? null;
    send = (body: FormData) => {
      this.sent = body;
    };
    abort = () => this.onabort?.();
  }

  const file = new File([new Uint8Array(10)], "leaf.jpg", { type: "image/jpeg" });

  it("reports real percentages and resolves with the created scan", async () => {
    const request = new FakeRequest();
    const seen: number[] = [];
    const promise = uploadScan(file, {
      createRequest: () => request,
      onProgress: (p) => seen.push(p),
    });
    request.upload.onprogress?.({ lengthComputable: true, loaded: 25, total: 100 });
    request.upload.onprogress?.({ lengthComputable: true, loaded: 100, total: 100 });
    request.status = 202;
    request.responseText = JSON.stringify({
      success: true,
      data: { id: "abc", status: "processing", stage: "validating" },
      error: null,
    });
    request.onload?.();
    const result = await promise;
    expect(seen).toEqual([25, 100, 100]);
    expect(result).toEqual({
      ok: true,
      data: { id: "abc", status: "processing", stage: "validating" },
    });
    expect(request.open).toHaveBeenCalledWith("POST", "/api/scans");
    expect(request.sent?.get("image")).toBeInstanceOf(File);
  });

  it("ignores progress events with unknown length", async () => {
    const request = new FakeRequest();
    const seen: number[] = [];
    const promise = uploadScan(file, {
      createRequest: () => request,
      onProgress: (p) => seen.push(p),
    });
    request.upload.onprogress?.({ lengthComputable: false, loaded: 5, total: 0 });
    request.onerror?.();
    await promise;
    expect(seen).toEqual([]);
  });

  it("maps an error envelope and the retry after header", async () => {
    const request = new FakeRequest();
    const promise = uploadScan(file, { createRequest: () => request });
    request.status = 429;
    request.headers["retry-after"] = "42";
    request.responseText = JSON.stringify({
      success: false,
      data: null,
      error: { code: "rate_limited", message: "Slow down." },
    });
    request.onload?.();
    const result = await promise;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("rate_limited");
      expect(result.error.retryAfterSeconds).toBe(42);
    }
  });

  it("treats a network error as unreachable and a malformed success as an error", async () => {
    const offline = new FakeRequest();
    const first = uploadScan(file, { createRequest: () => offline });
    offline.onerror?.();
    const firstResult = await first;
    expect(!firstResult.ok && firstResult.error.code).toBe("api_unreachable");

    const garbled = new FakeRequest();
    const second = uploadScan(file, { createRequest: () => garbled });
    garbled.status = 202;
    garbled.responseText = "not json";
    garbled.onload?.();
    const secondResult = await second;
    expect(secondResult.ok).toBe(false);
  });

  it("cancels through the abort signal", async () => {
    const request = new FakeRequest();
    const controller = new AbortController();
    const promise = uploadScan(file, { createRequest: () => request, signal: controller.signal });
    controller.abort();
    const result = await promise;
    expect(result.ok).toBe(false);
    expect("cancelled" in result && result.cancelled).toBe(true);
  });
});

describe("file validation", () => {
  it("accepts JPEG, PNG and WebP within the size cap", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
      expect(checkFile({ type, size: 1000 })).toBeNull();
    }
  });

  it("rejects other types, empty files and files over 8 MiB", () => {
    expect(checkFile({ type: "image/gif", size: 1000 })).toBe("type");
    expect(checkFile({ type: "application/pdf", size: 1000 })).toBe("type");
    expect(checkFile({ type: "image/jpeg", size: 0 })).toBe("empty");
    expect(checkFile({ type: "image/jpeg", size: MAX_FILE_BYTES + 1 })).toBe("too_large");
    expect(checkFile({ type: "image/jpeg", size: MAX_FILE_BYTES })).toBeNull();
  });

  it("checks pixel dimensions", () => {
    expect(checkDimensions(1200, 900)).toBeNull();
    expect(checkDimensions(100, 900)).toBe("too_small");
    expect(checkDimensions(9000, 9000)).toBe("too_many_pixels");
    expect(checkDimensions(0, 0)).toBe("unreadable");
    expect(checkDimensions(Number.NaN, 10)).toBe("unreadable");
  });
});

describe("error copy", () => {
  it("maps API codes to plain kinds without exclamation marks", () => {
    const codes = [
      "email_not_verified",
      "rate_limited",
      "scan_quota_exceeded",
      "invalid_image",
      "payload_too_large",
      "unsupported_media_type",
      "storage_unavailable",
      "ml_unavailable",
      "not_authenticated",
      "api_unreachable",
      "something_new",
    ];
    for (const code of codes) {
      const view = describeScanError({ code, status: 400 });
      expect(view.title.length).toBeGreaterThan(0);
      expect(`${view.title}${view.body}`).not.toContain("!");
    }
    expect(describeScanError({ code: "email_not_verified", status: 403 }).kind).toBe("unverified");
    expect(describeScanError({ code: "ml_unavailable", status: 503 }).title).toBe(
      "Analysis isn't available right now",
    );
  });

  it("carries the wait for rate limits, with a default", () => {
    expect(
      describeScanError({ code: "rate_limited", status: 429, retryAfterSeconds: 17 })
        .retryAfterSeconds,
    ).toBe(17);
    expect(describeScanError({ code: "rate_limited", status: 429 }).retryAfterSeconds).toBe(60);
  });

  it("explains a failed scan, with the special wording for ml_unavailable", () => {
    expect(describeFailure("ml_unavailable").title).toBe("Analysis isn't available right now");
    expect(describeFailure("prediction_failed").canRetry).toBe(true);
    expect(describeFailure(null).title).toContain("could not analyze");
  });
});

describe("deferred delete", () => {
  it("runs the action after the window", () => {
    vi.useFakeTimers();
    const action = vi.fn();
    defer(action, 6000);
    vi.advanceTimersByTime(5999);
    expect(action).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(action).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("never runs after Undo, and Undo after the run reports false", () => {
    vi.useFakeTimers();
    const action = vi.fn();
    const pending = defer(action, 6000);
    expect(pending.cancel()).toBe(true);
    vi.advanceTimersByTime(10_000);
    expect(action).not.toHaveBeenCalled();

    const ran = defer(action, 100);
    vi.advanceTimersByTime(200);
    expect(ran.cancel()).toBe(false);
    expect(action).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("flush runs once even if the timer fires later", () => {
    vi.useFakeTimers();
    const action = vi.fn();
    const pending = defer(action, 6000);
    pending.flush();
    pending.flush();
    vi.advanceTimersByTime(10_000);
    expect(action).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe("response parsing", () => {
  it("parses a detail and fills the optional fields with null", () => {
    const scan = parseScanDetail({ ...baseScan, stage: undefined, plant: undefined });
    expect(scan?.stage).toBeNull();
    expect(scan?.plant).toBeNull();
  });

  it("rejects an unknown status", () => {
    expect(parseScanDetail({ ...baseScan, status: "weird" })).toBeNull();
    expect(parseScanDetail("nope")).toBeNull();
  });

  it("skips bad rows in a list but keeps the cursor", () => {
    const page = parseScanPage({ items: [baseScan, { nope: true }], next_cursor: "c1" });
    expect(page?.items).toHaveLength(1);
    expect(page?.nextCursor).toBe("c1");
    expect(parseScanPage({ items: "x" })).toBeNull();
  });
});

describe("list query", () => {
  it("builds a bounded query and drops unsafe values", () => {
    expect(buildListQuery({})).toBe("limit=12");
    expect(buildListQuery({ limit: 500 })).toBe("limit=50");
    expect(buildListQuery({ limit: 0 })).toBe("limit=1");
    const full = new URLSearchParams(
      buildListQuery({
        limit: 10,
        cursor: "abc",
        plant: "tomato",
        verdict: "disease",
        status: "completed",
      }),
    );
    expect(Object.fromEntries(full)).toEqual({
      limit: "10",
      cursor: "abc",
      plant: "tomato",
      verdict: "disease",
      status: "completed",
    });
    expect(buildListQuery({ plant: "../../etc" })).toBe("limit=12");
  });
});
