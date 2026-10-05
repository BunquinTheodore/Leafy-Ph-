/**
 * Geometry probe, serialized into the page by wide-layout.spec.ts (measureLayout.toString()).
 * It must stay self contained: no imports, no references to module scope values.
 */
export interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
}

export interface LayoutReport {
  vw: number;
  vh: number;
  hOverflow: number;
  docRatio: number;
  headings: { text: string; lines: number }[];
  group: Box | null;
  /** Widest empty vertical strip between content rectangles (empty middle detector). */
  maxXGap: number;
  headingGaps: { text: string; gap: number; with?: string }[];
  decorNotHidden: string[];
  decorHits: { decor: string; content: string }[];
  cardOverlaps: string[];
}

export function measureLayout(): LayoutReport {
  const CARD = ".card, .card-panel, .ccard, .hcard, .pcard, .scan-card, .auth-card, [data-card]";
  const SKIP =
    ".site-header, .site-footer, .panels__controls, .panels__hint, .skip-link, .sr-only, #leafy-splash, [data-no-measure]";
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const box = (rect: DOMRect): Box => ({
    l: rect.left,
    t: rect.top,
    r: rect.right,
    b: rect.bottom,
  });
  const area = (b: Box) => (b.r - b.l) * (b.b - b.t);
  const intersects = (a: Box, b: Box) =>
    Math.min(a.r, b.r) - Math.max(a.l, b.l) > 1 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 1;
  const label = (el: Element) => {
    const cls =
      typeof el.className === "string"
        ? el.className.trim().split(/\s+/).slice(0, 2).join(".")
        : "";
    return el.tagName.toLowerCase() + (cls ? "." + cls : "");
  };

  const shown = (el: Element): boolean => {
    for (let node: Element | null = el; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") return false;
      if (node.hasAttribute("inert") || node.hasAttribute("hidden")) return false;
      if (node.classList.contains("panels__panel") && node.getAttribute("data-active") === "false")
        return false;
    }
    return true;
  };
  const inDecor = (el: Element) => Boolean(el.closest("[data-decor]"));
  const skipped = (el: Element) => Boolean(el.closest(SKIP));

  const textBoxes = (el: Element): Box[] => {
    const out: Box[] = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim()) continue;
      const parent = node.parentElement;
      if (!parent || !shown(parent)) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of Array.from(range.getClientRects()))
        if (rect.width > 0 && rect.height > 0) out.push(box(rect));
    }
    return out;
  };

  /** Clip a rectangle to the viewport and to every scrolling or clipping ancestor (rails, panels). */
  const clip = (el: Element, b: Box): Box | null => {
    let out: Box = {
      l: Math.max(b.l, 0),
      t: Math.max(b.t, 0),
      r: Math.min(b.r, vw),
      b: Math.min(b.b, vh),
    };
    for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.overflowX === "visible" && style.overflowY === "visible") continue;
      const rect = node.getBoundingClientRect();
      out = {
        l: Math.max(out.l, rect.left),
        t: Math.max(out.t, rect.top),
        r: Math.min(out.r, rect.right),
        b: Math.min(out.b, rect.bottom),
      };
    }
    return out.r - out.l > 1 && out.b - out.t > 1 ? out : null;
  };

  /** Content rectangles: real text lines, controls, pictures and small icons outside decoration. */
  interface Content {
    el: Element;
    box: Box;
    kind: "text" | "control" | "icon" | "media";
  }
  const content: Content[] = [];
  const push = (el: Element, b: Box, kind: Content["kind"]) => {
    const clipped = clip(el, b);
    if (clipped) content.push({ el, box: clipped, kind });
  };
  const main = document.querySelector("main") ?? document.body;
  const candidates = Array.from(main.querySelectorAll("*")).filter(
    (el) => !el.matches("script, style, noscript") && !inDecor(el) && !skipped(el),
  );
  for (const el of candidates) {
    if (!shown(el)) continue;
    const tag = el.tagName.toLowerCase();
    const rect = el.getBoundingClientRect();
    if (["input", "select", "textarea", "button"].includes(tag) && rect.width > 0) {
      push(el, box(rect), "control");
    } else if (tag === "img" && rect.width > 0) {
      push(el, box(rect), "media");
    } else if (tag === "svg" && rect.width > 0 && rect.width <= 64 && rect.height <= 64) {
      push(el, box(rect), "icon");
    }
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType !== Node.TEXT_NODE || !child.textContent?.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(child);
      for (const r of Array.from(range.getClientRects()))
        if (r.width > 0 && r.height > 0) push(el, box(r), "text");
    }
  }

  const union = (boxes: Box[]): Box | null =>
    boxes.length
      ? {
          l: Math.min(...boxes.map((b) => b.l)),
          t: Math.min(...boxes.map((b) => b.t)),
          r: Math.max(...boxes.map((b) => b.r)),
          b: Math.max(...boxes.map((b) => b.b)),
        }
      : null;
  const group = union(content.map((c) => c.box));
  const spans: [number, number][] = content
    .map((c): [number, number] => [c.box.l, c.box.r])
    .sort((a, b) => a[0] - b[0]);
  let maxXGap = 0;
  let reach = spans[0]?.[1] ?? 0;
  for (const [l, r] of spans) {
    maxXGap = Math.max(maxXGap, l - reach);
    reach = Math.max(reach, r);
  }

  // Headings: at most two lines each.
  const headings = Array.from(main.querySelectorAll("h1, h2"))
    .filter((el) => shown(el) && !skipped(el))
    .map((el) => {
      const tops = new Set(textBoxes(el).map((b) => Math.round(b.t / 6)));
      return { text: (el.textContent ?? "").trim().slice(0, 40), lines: tops.size };
    });

  // Heading block (the h1 plus whatever stacks under it) and its nearest companion beside it.
  const headingGaps: { text: string; gap: number; with?: string }[] = [];
  const h1s = Array.from(main.querySelectorAll("h1")).filter(
    (el) => shown(el) && !skipped(el) && !inDecor(el),
  );
  for (const h of h1s) {
    const hb = union(textBoxes(h));
    if (!hb) continue;
    // The block is the heading plus what stacks right under or over it (gaps up to one stack step).
    const STACK_STEP = 56;
    const column = content
      .filter((c) => c.box.l < hb.r && c.box.r > hb.l)
      .map((c) => c.box)
      .sort((a, b) => a.t - b.t);
    let cluster: Box = hb;
    for (let grew = true; grew;) {
      grew = false;
      for (const b of column) {
        const near = b.t <= cluster.b + STACK_STEP && b.b >= cluster.t - STACK_STEP;
        const inside = b.t >= cluster.t && b.b <= cluster.b && b.l >= cluster.l && b.r <= cluster.r;
        if (near && !inside) {
          cluster = union([cluster, b]) as Box;
          grew = true;
        }
      }
    }
    const beside = content.filter((c) => c.box.t < cluster.b && c.box.b > cluster.t);
    const sides = [
      ...beside
        .filter((c) => c.box.l >= cluster.r - 1)
        .map((c) => ({ gap: c.box.l - cluster.r, c })),
      ...beside
        .filter((c) => c.box.r <= cluster.l + 1)
        .map((c) => ({ gap: cluster.l - c.box.r, c })),
    ].sort((a, b) => a.gap - b.gap);
    const nearest = sides[0];
    if (nearest)
      headingGaps.push({
        text: (h.textContent ?? "").trim().slice(0, 40),
        gap: nearest.gap,
        with: label(nearest.c.el) + " " + (nearest.c.el.textContent ?? "").trim().slice(0, 24),
      });
  }

  // Decoration: aria-hidden and clear of every text, control and icon rectangle.
  const decorEls = Array.from(document.querySelectorAll("[data-decor]")).filter(
    (el) => shown(el) && el.getBoundingClientRect().width > 0,
  );
  const decorNotHidden = decorEls
    .filter((el) => !el.closest("[aria-hidden='true']"))
    .map((el) => label(el));
  const decorHits: { decor: string; content: string }[] = [];
  for (const decor of decorEls) {
    const db = box(decor.getBoundingClientRect());
    for (const c of content) {
      if (c.kind === "media") continue;
      if (decor.contains(c.el) || c.el.contains(decor)) continue;
      if (intersects(db, c.box))
        decorHits.push({
          decor: label(decor),
          content: label(c.el) + " " + (c.el.textContent ?? "").trim().slice(0, 24),
        });
    }
  }

  // Sibling cards must not overlap.
  const cardOverlaps: string[] = [];
  const parents = new Set(
    Array.from(main.querySelectorAll(CARD))
      .filter(shown)
      .map((el) => el.parentElement),
  );
  parents.forEach((parent) => {
    if (!parent) return;
    const cards = Array.from(parent.children).filter((el) => el.matches(CARD) && shown(el));
    for (let i = 0; i < cards.length; i++)
      for (let j = i + 1; j < cards.length; j++) {
        const first = cards[i];
        const second = cards[j];
        if (!first || !second) continue;
        const a = box(first.getBoundingClientRect());
        const b = box(second.getBoundingClientRect());
        if (area(a) > 0 && area(b) > 0 && intersects(a, b))
          cardOverlaps.push(label(first) + " x " + label(second));
      }
  });

  const doc = document.documentElement;
  return {
    vw,
    vh,
    hOverflow: Math.max(0, doc.scrollWidth - vw),
    docRatio: doc.scrollHeight / vh,
    headings,
    group,
    maxXGap,
    headingGaps,
    decorNotHidden,
    decorHits,
    cardOverlaps,
  };
}
