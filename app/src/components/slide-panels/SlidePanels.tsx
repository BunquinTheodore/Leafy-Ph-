"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { usePrefersReducedMotion } from "../interaction/hooks";
import { clamp } from "../interaction/math";
import { useSfx } from "../sfx/SfxProvider";
import { indexForHash, indexForScroll, isNearActive } from "./panel-math";

export interface Panel {
  /** Used for the URL hash deep link, e.g. "treatment" gives #treatment. */
  id: string;
  /** Short label shown on the dot and announced to screen readers. */
  title: string;
  content: ReactNode;
}

interface SlidePanelsProps {
  /** Accessible name of the whole carousel. */
  label: string;
  panels: Panel[];
  className?: string;
  /** Show the "swipe or use arrows" hint until the first interaction. */
  showHint?: boolean;
  /** Keep the URL hash in sync (deep links). Defaults to true. */
  syncHash?: boolean;
  /** Shared container width for the slides and the controls (see styles/LAYOUT.md). */
  width?: "narrow" | "standard" | "wide";
}

const DRAG_THRESHOLD_PX = 6;
const SMOOTH_SCROLL_LOCK_MS = 700;
/** Scrolled less than this from the bottom counts as the end (no fade). */
const MORE_BELOW_PX = 8;
const NO_DRAG = "a, button, input, textarea, select, label, [role=button], [data-no-drag]";

/**
 * Sideways content. CSS scroll-snap is the base, so touch swipe, trackpads and shift+wheel work
 * natively; this adds arrows, labeled dots, arrow/Home/End keys, mouse drag, aria-live
 * announcements and hash deep links. Reduced motion jumps instantly and cross-fades.
 */
export function SlidePanels({
  label,
  panels,
  className,
  showHint = true,
  syncHash = true,
  width,
}: SlidePanelsProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [touched, setTouched] = useState(false);
  const reduced = usePrefersReducedMotion();
  const sfx = useSfx();
  const activeRef = useRef(0);
  const frame = useRef(0);
  /** Ignore scroll events caused by our own animated scrolling until it settles. */
  const lockUntil = useRef(0);
  const ids = panels.map((panel) => panel.id);
  const count = panels.length;

  const commit = useCallback(
    (index: number, userInitiated: boolean) => {
      if (index === activeRef.current) return;
      activeRef.current = index;
      setActive(index);
      if (userInitiated) {
        setTouched(true);
        sfx.play("panel");
      }
      const id = ids[index];
      if (syncHash && id) window.history.replaceState(null, "", `#${id}`);
    },
    // ids is derived from panels; join keeps the dependency stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ids.join("|"), sfx, syncHash],
  );

  const goTo = useCallback(
    (target: number, behavior?: ScrollBehavior) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const index = clamp(target, 0, count - 1);
      const resolved = behavior ?? (reduced ? "auto" : "smooth");
      lockUntil.current = performance.now() + (resolved === "smooth" ? SMOOTH_SCROLL_LOCK_MS : 60);
      viewport.scrollTo({ left: index * viewport.clientWidth, behavior: resolved });
      commit(index, true);
    },
    [commit, count, reduced],
  );

  // Deep link on load and when the hash changes.
  useEffect(() => {
    if (!syncHash) return;
    const apply = (behavior: ScrollBehavior) => {
      const index = indexForHash(window.location.hash, ids);
      if (index === null || index === activeRef.current) return;
      // Scroll events from this animation must not flip the active panel back on the way.
      lockUntil.current = performance.now() + (behavior === "smooth" ? SMOOTH_SCROLL_LOCK_MS : 60);
      viewportRef.current?.scrollTo({
        left: index * (viewportRef.current?.clientWidth ?? 0),
        behavior,
      });
      activeRef.current = index;
      setActive(index);
    };
    apply("auto");
    const onHash = () => apply(reduced ? "auto" : "smooth");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join("|"), syncHash, reduced]);

  const onScroll = () => {
    if (frame.current || performance.now() < lockUntil.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const viewport = viewportRef.current;
      if (!viewport) return;
      commit(indexForScroll(viewport.scrollLeft, viewport.clientWidth, count), true);
    });
  };

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  // A panel taller than the screen scrolls, so keyboard users must be able to focus it.
  useEffect(() => {
    const panel = viewportRef.current?.children[active];
    if (!(panel instanceof HTMLElement)) return;
    const update = () => {
      if (panel.scrollHeight > panel.clientHeight + 1) panel.tabIndex = 0;
      else panel.removeAttribute("tabindex");
      // More content below the fold: CSS shows a bottom fade as the scroll cue.
      const more = panel.scrollHeight - panel.clientHeight - panel.scrollTop > MORE_BELOW_PX;
      if (more) panel.setAttribute("data-more", "true");
      else panel.removeAttribute("data-more");
    };
    update();
    panel.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(update) : null;
    observer?.observe(panel);
    for (const child of Array.from(panel.children)) observer?.observe(child);
    return () => {
      observer?.disconnect();
      panel.removeEventListener("scroll", update);
      panel.removeAttribute("tabindex");
      panel.removeAttribute("data-more");
    };
  }, [active, count]);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable=true]")) return;
    const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key as "ArrowLeft" | "ArrowRight"];
    if (step) {
      event.preventDefault();
      goTo(activeRef.current + step);
    } else if (event.key === "Home") {
      event.preventDefault();
      goTo(0);
    } else if (event.key === "End") {
      event.preventDefault();
      goTo(count - 1);
    }
  };

  // Mouse drag to scroll; touch uses native scrolling.
  const drag = useRef<{ startX: number; startLeft: number; moved: boolean } | null>(null);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    if ((event.target as HTMLElement).closest(NO_DRAG)) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    drag.current = { startX: event.clientX, startLeft: viewport.scrollLeft, moved: false };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    const viewport = viewportRef.current;
    if (!state || !viewport) return;
    const dx = event.clientX - state.startX;
    if (!state.moved && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
    if (!state.moved) {
      state.moved = true;
      viewport.setAttribute("data-dragging", "true");
      viewport.setPointerCapture(event.pointerId);
    }
    viewport.scrollLeft = state.startLeft - dx;
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    const viewport = viewportRef.current;
    drag.current = null;
    if (!state?.moved || !viewport) return;
    viewport.removeAttribute("data-dragging");
    if (viewport.hasPointerCapture(event.pointerId))
      viewport.releasePointerCapture(event.pointerId);
    const dx = event.clientX - state.startX;
    const index = indexForScroll(state.startLeft - dx, viewport.clientWidth, count);
    goTo(index);
  };

  const current = panels[active];
  return (
    <section
      className={["panels", className ?? ""].filter(Boolean).join(" ")}
      aria-roledescription="carousel"
      aria-label={label}
      data-width={width}
      onKeyDown={onKeyDown}
    >
      <div
        ref={viewportRef}
        className="panels__viewport"
        // A scrollable region must be reachable by keyboard (arrow keys then move between panels).
        tabIndex={0}
        data-cursor="grab"
        onScroll={onScroll}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {panels.map((panel, index) => (
          <div
            key={panel.id}
            id={panel.id}
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${count}: ${panel.title}`}
            className="panels__panel"
            data-active={index === active}
            data-near={isNearActive(index, active)}
            inert={index !== active}
          >
            {panel.content}
          </div>
        ))}
      </div>

      <div className="panels__controls">
        <button
          type="button"
          className="btn btn-secondary btn-icon pressable panels__arrow"
          aria-label="Previous panel"
          disabled={active === 0}
          onClick={() => goTo(active - 1)}
          data-sfx="none"
        >
          <ChevronLeft size={20} strokeWidth={1.5} aria-hidden="true" />
        </button>
        <ul className="panels__dots" aria-label={`${label} panels`}>
          {panels.map((panel, index) => (
            <li key={panel.id}>
              <button
                type="button"
                className="panels__dot"
                aria-label={`Go to ${panel.title}`}
                aria-current={index === active ? "true" : undefined}
                title={panel.title}
                onClick={() => goTo(index)}
                data-sfx="none"
              >
                <span className="panels__dot-label">{panel.title}</span>
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="btn btn-secondary btn-icon pressable panels__arrow"
          aria-label="Next panel"
          disabled={active === count - 1}
          onClick={() => goTo(active + 1)}
          data-sfx="none"
        >
          <ChevronRight size={20} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>

      {showHint && !touched && count > 1 ? (
        <p className="panels__hint m-0 pb-3">Swipe, drag or use the arrow keys.</p>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {current ? `Panel ${active + 1} of ${count}: ${current.title}` : ""}
      </p>
    </section>
  );
}
