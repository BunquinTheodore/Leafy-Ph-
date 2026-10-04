// Small geometry helpers shared by the diagram layout and its self tests.
// All coordinates are CSS pixels in SVG user space. Segments are orthogonal.

export const rect = (x, y, w, h) => ({ x, y, w, h });

export const inflate = (r, d) => ({ x: r.x - d, y: r.y - d, w: r.w + 2 * d, h: r.h + 2 * d });

/** True when the rectangles share interior area larger than eps on both axes. */
export function rectsIntersect(a, b, eps = 0) {
  return a.x + a.w - eps > b.x && b.x + b.w - eps > a.x && a.y + a.h - eps > b.y && b.y + b.h - eps > a.y;
}

export const isHorizontal = (s) => s.y1 === s.y2;

/** Strict (open interval) intersection of an orthogonal segment with a rectangle interior. */
export function segHitsRect(s, r) {
  if (isHorizontal(s)) {
    const lo = Math.min(s.x1, s.x2);
    const hi = Math.max(s.x1, s.x2);
    return s.y1 > r.y && s.y1 < r.y + r.h && lo < r.x + r.w && hi > r.x;
  }
  const lo = Math.min(s.y1, s.y2);
  const hi = Math.max(s.y1, s.y2);
  return s.x1 > r.x && s.x1 < r.x + r.w && lo < r.y + r.h && hi > r.y;
}

/**
 * Relation of two orthogonal segments: 'overlap' (collinear within tol and sharing length),
 * 'cross' (perpendicular interiors meet) or 'none'.
 */
export function segRelation(a, b, tol = 5) {
  const ah = isHorizontal(a);
  const bh = isHorizontal(b);
  if (ah === bh) {
    if (ah) {
      if (Math.abs(a.y1 - b.y1) >= tol) return 'none';
      const lo = Math.max(Math.min(a.x1, a.x2), Math.min(b.x1, b.x2));
      const hi = Math.min(Math.max(a.x1, a.x2), Math.max(b.x1, b.x2));
      return hi - lo > 0.5 ? 'overlap' : 'none';
    }
    if (Math.abs(a.x1 - b.x1) >= tol) return 'none';
    const lo = Math.max(Math.min(a.y1, a.y2), Math.min(b.y1, b.y2));
    const hi = Math.min(Math.max(a.y1, a.y2), Math.max(b.y1, b.y2));
    return hi - lo > 0.5 ? 'overlap' : 'none';
  }
  const h = ah ? a : b;
  const v = ah ? b : a;
  const inX = v.x1 > Math.min(h.x1, h.x2) + 0.5 && v.x1 < Math.max(h.x1, h.x2) - 0.5;
  const inY = h.y1 > Math.min(v.y1, v.y2) + 0.5 && h.y1 < Math.max(v.y1, v.y2) - 0.5;
  return inX && inY ? 'cross' : 'none';
}

/** Polyline points [{x,y}] to orthogonal segments. */
export function toSegments(points) {
  const out = [];
  for (let i = 1; i < points.length; i += 1) {
    out.push({ x1: points[i - 1].x, y1: points[i - 1].y, x2: points[i].x, y2: points[i].y });
  }
  return out;
}

/** Point lies on the border of rect (within tol) and not strictly inside it. */
export function onBoundary(p, r, tol = 0.75) {
  const insideOuter = p.x >= r.x - tol && p.x <= r.x + r.w + tol && p.y >= r.y - tol && p.y <= r.y + r.h + tol;
  const insideInner = p.x > r.x + tol && p.x < r.x + r.w - tol && p.y > r.y + tol && p.y < r.y + r.h - tol;
  return insideOuter && !insideInner;
}

export class MinHeap {
  constructor() {
    this.items = [];
  }

  get size() {
    return this.items.length;
  }

  push(priority, value) {
    const items = this.items;
    items.push({ priority, value });
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent].priority <= items[i].priority) break;
      [items[parent], items[i]] = [items[i], items[parent]];
      i = parent;
    }
  }

  pop() {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < items.length && items[l].priority < items[m].priority) m = l;
        if (r < items.length && items[r].priority < items[m].priority) m = r;
        if (m === i) break;
        [items[m], items[i]] = [items[i], items[m]];
        i = m;
      }
    }
    return top.value;
  }
}
