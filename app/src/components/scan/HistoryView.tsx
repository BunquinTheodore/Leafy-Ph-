"use client";

import { ChevronLeft, ChevronRight, LayoutGrid, Rows3, ScanLine } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { scanCopy } from "@/lib/i18n/scan-en";
import { fetchScan, fetchScanPage } from "@/lib/scans/api";
import { pollDelay } from "@/lib/scans/polling";
import {
  SCAN_VERDICTS,
  isLive,
  type ScanPage,
  type ScanSummary,
  type ScanVerdict,
} from "@/lib/scans/types";
import { useSfx } from "../sfx/SfxProvider";
import { Button, LinkButton } from "../ui/Button";
import { Alert, EmptyState } from "../ui/Display";
import { useToast } from "../ui/Toast";
import { deleteWithUndo } from "./delete";
import { HistoryCard } from "./HistoryCard";
import { useHiddenScans } from "./hooks";
import "./scan.css";

const copy = scanCopy.history;
const PAGE_SIZE = 12;
const LIVE_LIMIT = 8;
const VIEW_KEY = "leafy-history-view";

type ViewMode = "rail" | "grid";

interface Filters {
  plant: string;
  verdict: "" | ScanVerdict;
}

const NO_FILTERS: Filters = { plant: "", verdict: "" };

function readView(): ViewMode {
  try {
    return window.localStorage.getItem(VIEW_KEY) === "grid" ? "grid" : "rail";
  } catch {
    return "rail";
  }
}

function writeView(mode: ViewMode): void {
  try {
    window.localStorage.setItem(VIEW_KEY, mode);
  } catch {
    // Storage blocked: the choice lasts until the page reloads.
  }
}

/** Replaces rows by id with fresher copies, keeping order. */
function mergeFresh(items: readonly ScanSummary[], fresh: readonly ScanSummary[]): ScanSummary[] {
  const byId = new Map(fresh.map((scan) => [scan.id, scan]));
  return items.map((scan) => byId.get(scan.id) ?? scan);
}

function appendUnique(items: readonly ScanSummary[], more: readonly ScanSummary[]): ScanSummary[] {
  const seen = new Set(items.map((scan) => scan.id));
  return [...items, ...more.filter((scan) => !seen.has(scan.id))];
}

interface PlantOption {
  slug: string;
  name: string;
}

interface HistoryViewProps {
  /** First page from the server; null when it could not be loaded. */
  initial: ScanPage | null;
  plants: readonly PlantOption[];
}

/** /scans: filters, a card rail (or grid), live badges for running scans, keyset Load more. */
export function HistoryView({ initial, plants }: HistoryViewProps) {
  const toast = useToast();
  const sfx = useSfx();
  const hidden = useHiddenScans();
  const [items, setItems] = useState<ScanSummary[]>(initial?.items ?? []);
  const [cursor, setCursor] = useState<string | null>(initial?.nextCursor ?? null);
  const [failed, setFailed] = useState(initial === null);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [view, setView] = useState<ViewMode>("rail");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const rail = useRef<HTMLUListElement>(null);
  const firstRun = useRef(true);

  useEffect(() => setView(readView()), []);

  const chooseView = (mode: ViewMode) => {
    setView(mode);
    writeView(mode);
  };

  const load = useCallback(async (next: Filters, signal?: AbortSignal) => {
    setLoading(true);
    const result = await fetchScanPage(
      { limit: PAGE_SIZE, plant: next.plant || null, verdict: next.verdict || null },
      signal,
    );
    if (signal?.aborted) return;
    setLoading(false);
    if (result.ok) {
      setItems(result.data.items);
      setCursor(result.data.nextCursor);
      setFailed(false);
    } else {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const controller = new AbortController();
    void load(filters, controller.signal);
    return () => controller.abort();
  }, [filters, load]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    const result = await fetchScanPage({
      limit: PAGE_SIZE,
      cursor,
      plant: filters.plant || null,
      verdict: filters.verdict || null,
    });
    setLoadingMore(false);
    if (!result.ok) {
      toast({ message: copy.errorBody, tone: "error" });
      return;
    }
    setItems((current) => appendUnique(current, result.data.items));
    setCursor(result.data.nextCursor);
  }

  // Scans that are still running refresh in place, with the same gentle backoff as the tracker.
  const liveIds = useMemo(
    () =>
      items
        .filter(isLive)
        .slice(0, LIVE_LIMIT)
        .map((scan) => scan.id)
        .join(","),
    [items],
  );
  useEffect(() => {
    if (!liveIds) return;
    const ids = liveIds.split(",");
    const controller = new AbortController();
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const results = await Promise.all(ids.map((id) => fetchScan(id, controller.signal)));
      if (controller.signal.aborted) return;
      const fresh = results.flatMap((result) => (result.ok ? [result.scan] : []));
      if (fresh.length > 0) setItems((current) => mergeFresh(current, fresh));
      attempt += 1;
      timer = setTimeout(() => void tick(), pollDelay(attempt));
    };
    timer = setTimeout(() => void tick(), pollDelay(0));
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [liveIds]);

  const visible = useMemo(() => items.filter((scan) => !hidden.has(scan.id)), [items, hidden]);
  const filtered = filters.plant !== "" || filters.verdict !== "";

  const page = (direction: 1 | -1) => {
    const element = rail.current;
    if (!element) return;
    element.scrollBy({ left: direction * element.clientWidth * 0.9, behavior: "smooth" });
  };

  const onDelete = (scan: ScanSummary) =>
    deleteWithUndo({ id: scan.id, toast, playDelete: () => sfx.play("delete") });

  const loadMoreButton = cursor ? (
    <Button
      variant="secondary"
      onClick={() => void loadMore()}
      loading={loadingMore}
      data-testid="load-more"
    >
      {loadingMore ? copy.loadingMore : copy.loadMore}
    </Button>
  ) : null;

  let body;
  if (failed && visible.length === 0) {
    body = (
      <div className="hist__state">
        <Alert tone="warning" title={copy.errorTitle}>
          {copy.errorBody}
        </Alert>
        <Button onClick={() => void load(filters)} loading={loading}>
          {copy.retry}
        </Button>
      </div>
    );
  } else if (visible.length === 0 && !loading) {
    body = (
      <div className="hist__state">
        {filtered ? (
          <EmptyState
            headingLevel={2}
            title={copy.noMatchTitle}
            action={
              <Button variant="secondary" onClick={() => setFilters(NO_FILTERS)}>
                {copy.clearFilters}
              </Button>
            }
          >
            {copy.noMatchBody}
          </EmptyState>
        ) : (
          <EmptyState
            headingLevel={2}
            title={copy.emptyTitle}
            action={
              <LinkButton href="/scan" size="lg">
                <ScanLine size={20} strokeWidth={1.5} aria-hidden="true" />
                {copy.emptyAction}
              </LinkButton>
            }
          >
            {copy.emptyBody}
          </EmptyState>
        )}
      </div>
    );
  } else {
    body = (
      <div className="hist__content" data-view={view} aria-busy={loading || undefined}>
        <ul
          ref={rail}
          className={view === "rail" ? "hist__rail" : "hist__grid"}
          aria-label={copy.railLabel}
          data-no-drag
          data-testid="history-list"
        >
          {visible.map((scan) => (
            <li key={scan.id} className="hist__item">
              <HistoryCard scan={scan} onDelete={onDelete} />
            </li>
          ))}
          {view === "rail" && loadMoreButton ? (
            <li className="hist__item hist__item--more">{loadMoreButton}</li>
          ) : null}
        </ul>
        {view === "grid" && loadMoreButton ? (
          <div className="hist__more">{loadMoreButton}</div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="hist stage-fill wide-stage" data-width="standard" data-testid="history-view">
      <div className="wide-container hist__inner">
        <header className="hist__head">
          <div className="hist__titles">
            <p className="eyebrow m-0">{copy.eyebrow}</p>
            <h1 className="display display-sm">{copy.title}</h1>
          </div>
          <LinkButton href="/scan" size="md" className="hist__cta">
            <ScanLine size={20} strokeWidth={1.5} aria-hidden="true" />
            {scanCopy.page.title}
          </LinkButton>
        </header>

        <div className="hist__toolbar" role="group" aria-label={copy.filtersLabel}>
          <label className="pick pick--inline">
            <span className="pick__label">{copy.plant}</span>
            <select
              className="pick__select"
              value={filters.plant}
              onChange={(event) => setFilters({ ...filters, plant: event.target.value })}
              data-testid="filter-plant"
            >
              <option value="">{copy.all}</option>
              {plants.map((plant) => (
                <option key={plant.slug} value={plant.slug}>
                  {plant.name}
                </option>
              ))}
            </select>
          </label>
          <label className="pick pick--inline">
            <span className="pick__label">{copy.verdict}</span>
            <select
              className="pick__select"
              value={filters.verdict}
              onChange={(event) =>
                setFilters({ ...filters, verdict: event.target.value as Filters["verdict"] })
              }
              data-testid="filter-verdict"
            >
              <option value="">{copy.all}</option>
              {SCAN_VERDICTS.map((verdict) => (
                <option key={verdict} value={verdict}>
                  {copy.verdicts[verdict]}
                </option>
              ))}
            </select>
          </label>
          <div className="hist__toggle" role="group" aria-label={copy.viewLabel}>
            <button
              type="button"
              className="btn btn-secondary btn-sm pressable"
              aria-pressed={view === "rail"}
              onClick={() => chooseView("rail")}
              data-sfx="toggle"
            >
              <Rows3 size={16} strokeWidth={1.5} aria-hidden="true" />
              {copy.rail}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm pressable"
              aria-pressed={view === "grid"}
              onClick={() => chooseView("grid")}
              data-sfx="toggle"
            >
              <LayoutGrid size={16} strokeWidth={1.5} aria-hidden="true" />
              {copy.grid}
            </button>
          </div>
          <p className="hist__count m-0" role="status">
            {copy.count(visible.length)}
          </p>
        </div>

        {body}

        {view === "rail" && visible.length > 0 ? (
          <div className="hist__pager">
            <button
              type="button"
              className="btn btn-secondary btn-icon pressable"
              aria-label={copy.prev}
              onClick={() => page(-1)}
              data-sfx="none"
            >
              <ChevronLeft size={20} strokeWidth={1.5} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-icon pressable"
              aria-label={copy.next}
              onClick={() => page(1)}
              data-sfx="none"
            >
              <ChevronRight size={20} strokeWidth={1.5} aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
