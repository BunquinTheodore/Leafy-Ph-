// Diagram helper: lays boxes out in lanes / a grid with measured text, routes orthogonal
// arrows around the boxes (A* over a track grid), places edge labels beside their line and
// emits SVG. Nothing is positioned by hand, and the result is validated before it is returned,
// so a diagram that would overlap fails the build instead of printing wrong.
//
//   const out = await layoutDiagram(spec, { measure, maxWidth, maxHeight });
//   out.svg   -> string of inline SVG
//   out.model -> { width, height, boxes, lanes, edges, labels } (used by the self tests)

import {
  MinHeap, inflate, onBoundary, rectsIntersect, segHitsRect, segRelation, toSegments,
} from './geometry.mjs';

/** Usable inner width / height (CSS px at 96 dpi) of a .flow-svg figure on each A4 orientation. */
export const FLOW_WIDTH = { landscape: 980, portrait: 650 };
export const FLOW_HEIGHT = { landscape: 570, portrait: 880 };

const BASE_FONTS = {
  title: { family: 'Poppins', weight: 600, size: 13 },
  sub: { family: 'Manrope', weight: 500, size: 12 },
  label: { family: 'Poppins', weight: 500, size: 11 },
  lane: { family: 'Poppins', weight: 600, size: 11 },
};
/** Per diagram fonts: options.fontSize = { title, sub, label, lane } overrides sizes; options.labelSize is a shortcut for the edge label. */
const fontsFor = (o) => {
  const sizes = { ...(o.fontSize ?? {}), ...(o.labelSize ? { label: o.labelSize } : {}) };
  return Object.fromEntries(Object.entries(BASE_FONTS).map(([k, f]) => [k, { ...f, size: sizes[k] ?? f.size }]));
};
const css = (f) => `${f.weight} ${f.size}px ${f.family}`;

export const PALETTE = {
  ink: '#0e2316', soft: '#46604f', brand: '#23813a', deep: '#17542d', tint: '#e4f3e5',
  paper: '#ffffff', lane: '#f1f7ef', laneAlt: '#f7faf6', rule: '#cfe0cb', amber: '#a86a00',
};

export const EDGE_STYLES = {
  request: { dash: '', cap: 'butt', width: 1.7, color: PALETTE.brand },
  response: { dash: '7 4', cap: 'butt', width: 1.7, color: PALETTE.deep },
  // dotted: heavy round dots with a wide gap, so the style still reads in grayscale next to dashes
  optional: { dash: '0.1 6.2', cap: 'round', width: 2.6, color: PALETTE.ink },
};

const KIND_STYLES = {
  default: { fill: PALETTE.paper, stroke: PALETTE.brand, sw: 1.4 },
  built: { fill: '#cfe6cb', stroke: PALETTE.deep, sw: 3 },
  primary: { fill: PALETTE.tint, stroke: PALETTE.deep, sw: 2 },
  external: { fill: '#f3f5f3', stroke: PALETTE.soft, sw: 1.4 },
  final: { fill: '#e9ecea', stroke: PALETTE.ink, sw: 1.6, dash: '7 4' },
  store: { fill: '#fbf7ec', stroke: PALETTE.amber, sw: 1.6 },
  // end point of a path: a small dotted outline box, used for "stops here" results
  terminal: { fill: PALETTE.paper, stroke: PALETTE.soft, sw: 1.6, dash: '2 3' },
};

const DEFAULTS = {
  gapX: 72, gapY: 52, padX: 12, padY: 9, minNodeW: 104, maxNodeW: 196, margin: 8,
  clearance: 8, stub: 16, trackGap: 12, lanePad: 22, laneGap: 10, bendCost: 30,
  head: 9, headHalf: 4.5, labelPad: 4, labelGap: 4, laneLabelMax: 104,
  hug: 0, hugCost: 0.9, balance: false, fillHeight: 0, fillMaxExtra: 30,
};

/** Options the App flows section opts in to: roomier labels, lines kept off box sides, balanced box text, rows spread over the page. */
export const FLOW_LAYOUT = {
  labelGap: 7, hug: 16, balance: true, fillHeight: 480, maxHeight: 490,
  edgeStyles: {
    // dashed: short dashes and a hollow head; dotted: round dots in the same green and weight as solid lines
    response: { dash: '6 3', hollow: true },
    optional: { color: PALETTE.brand, width: 1.9, dash: '0.1 5' },
  },
  labelSize: 12,
};

const SIDES = {
  right: { vx: 1, vy: 0, axis: 'y' }, left: { vx: -1, vy: 0, axis: 'y' },
  bottom: { vx: 0, vy: 1, axis: 'x' }, top: { vx: 0, vy: -1, axis: 'x' },
};
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const round1 = (n) => Math.round(n * 10) / 10;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------------------------------------------------------------------------------------------
// Text: wrap with measured words, then measure the final lines exactly.
// ---------------------------------------------------------------------------------------------

async function prepareText(spec, o, measure) {
  const jobs = [];
  const add = (text, font, limit) => { if (text) jobs.push({ text, font, limit }); };
  for (const n of spec.nodes) {
    add(n.title, o.fonts.title, n.noWrapTitle ? Infinity : o.maxNodeW - 2 * o.padX);
    add(n.sub, o.fonts.sub, o.maxNodeW - 2 * o.padX);
  }
  for (const l of spec.lanes ?? []) add(l.label, o.fonts.lane, o.laneLabelMax);
  const words = new Map();
  const wantWord = (w, f) => words.set(`${css(f)}|${w}`, { text: w, font: css(f) });
  for (const j of jobs) {
    // plain spaces only, so a non breaking space keeps its words together on one line
    j.words = j.text.split(/[ \t\r\n]+/).filter(Boolean);
    j.words.forEach((w) => wantWord(w, j.font));
    wantWord(' ', j.font);
  }
  const wordList = [...words.values()];
  const wordRes = await measure(wordList);
  const wordW = new Map(wordList.map((w, i) => [`${w.font}|${w.text}`, wordRes[i].w]));
  for (const j of jobs) {
    const f = css(j.font);
    const space = wordW.get(`${f}| `);
    const widths = j.words.map((w) => wordW.get(`${f}|${w}`));
    const wrap = (limit) => {
      const out = [];
      let cur = '';
      let curW = 0;
      j.words.forEach((w, i) => {
        const ww = widths[i];
        if (cur && curW + space + ww > limit) { out.push(cur); cur = w; curW = ww; } else { curW = cur ? curW + space + ww : ww; cur = cur ? `${cur} ${w}` : w; }
      });
      if (cur) out.push(cur);
      return out;
    };
    // a word wider than the limit sets the real limit; balancing then narrows it while the line count
    // stays the same, so no line ends on a lone word that a shorter first line would have avoided
    let limit = Math.max(j.limit, ...widths);
    let lines = wrap(limit);
    if (o.balance && lines.length > 1) {
      let lo = Math.max(...widths);
      let hi = limit;
      while (hi - lo > 0.5) {
        const mid = (lo + hi) / 2;
        if (wrap(mid).length === lines.length) hi = mid; else lo = mid;
      }
      limit = hi;
      lines = wrap(limit);
    }
    j.lines = lines;
  }
  const exactReq = [];
  for (const j of jobs) j.lines.forEach((t) => exactReq.push({ text: t, font: css(j.font) }));
  const labelReq = (spec.edges ?? []).filter((e) => e.label).map((e) => ({ text: e.label, font: css(o.fonts.label) }));
  const metricsReq = Object.values(o.fonts).map((f) => ({ text: 'Hg', font: css(f) }));
  const res = await measure([...exactReq, ...labelReq, ...metricsReq]);
  let k = 0;
  for (const j of jobs) j.measured = j.lines.map((t) => ({ text: t, w: res[k++].w }));
  const labelW = new Map();
  for (const e of (spec.edges ?? []).filter((x) => x.label)) labelW.set(e, res[k++].w);
  const metrics = {};
  for (const key of Object.keys(o.fonts)) { const m = res[k++]; metrics[key] = { asc: m.asc, desc: m.desc, lh: Math.ceil(m.asc + m.desc) + 2 }; }
  let ji = 0;
  const take = () => jobs[ji++];
  const nodeText = new Map();
  for (const n of spec.nodes) {
    const t = n.title ? take() : null;
    const s = n.sub ? take() : null;
    nodeText.set(n.id, { title: t?.measured ?? [], sub: s?.measured ?? [] });
  }
  const laneText = new Map();
  for (const l of spec.lanes ?? []) laneText.set(l.id, take().measured);
  return { nodeText, laneText, labelW, metrics };
}

// ---------------------------------------------------------------------------------------------
// Grid geometry
// ---------------------------------------------------------------------------------------------

function computeGrid(spec, o, text) {
  const lanes = spec.lanes?.length ? spec.lanes : null;
  const nodes = spec.nodes.map((n) => ({ ...n, laneId: lanes ? n.lane ?? lanes[0].id : null, slot: n.row ?? 0 }));
  for (const n of nodes) {
    const t = text.nodeText.get(n.id);
    const tw = Math.max(0, ...t.title.map((l) => l.w), ...t.sub.map((l) => l.w));
    n.natW = Math.max(o.minNodeW, Math.ceil(tw) + 2 * o.padX);
    const m = text.metrics;
    n.natH = 2 * o.padY + t.title.length * m.title.lh + (t.sub.length ? 3 + t.sub.length * m.sub.lh : 0);
  }
  const cols = [...new Set(nodes.map((n) => n.col))].sort((a, b) => a - b);
  // a node with spanTo (a column number) is stretched over the columns col..spanTo and does not size them
  const colW = cols.map((c) => Math.max(0, ...nodes.filter((n) => n.col === c && n.spanTo === undefined).map((n) => n.natW)));
  const laneList = lanes ?? [{ id: null }];
  const rowDefs = [];
  for (const lane of laneList) {
    const slots = [...new Set(nodes.filter((n) => n.laneId === lane.id).map((n) => n.slot))].sort((a, b) => a - b);
    slots.forEach((s) => rowDefs.push({ laneId: lane.id, slot: s }));
  }
  rowDefs.forEach((r) => { r.h = Math.max(...nodes.filter((n) => n.laneId === r.laneId && n.slot === r.slot).map((n) => n.natH)); });

  const outerX = o.outerX ?? Math.round(o.gapX * 0.6);
  let laneStrip = 0;
  if (lanes) laneStrip = Math.ceil(Math.max(...lanes.map((l) => Math.max(...text.laneText.get(l.id).map((x) => x.w)))) + 20);
  const xStart = lanes ? o.margin + laneStrip + outerX : outerX + o.margin;
  // a straight edge between neighbours in the same row needs a gutter at least as wide as its label
  const gaps = colW.slice(1).map(() => o.gapX);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const e of spec.edges) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    const lw = text.labelW.get(e);
    if (!a || !b || lw === undefined) continue;
    const ia = cols.indexOf(a.col);
    const ib = cols.indexOf(b.col);
    const sameRow = a.laneId === b.laneId && a.slot === b.slot;
    if (sameRow && Math.abs(ia - ib) === 1) {
      const g = Math.min(ia, ib);
      gaps[g] = Math.max(gaps[g], Math.ceil(lw) + 2 * o.labelPad + 24);
    }
  }
  const colX = [];
  let x = xStart;
  colW.forEach((w, i) => { colX[i] = x; x += w + (gaps[i] ?? 0); });
  const width = Math.ceil(x + outerX + o.margin);

  const outerY = lanes ? o.margin : (o.outerY ?? 30);
  let y = outerY;
  const laneBands = [];
  const rowY = new Map();
  const padLane = lanes ? o.lanePad : 0;
  for (const lane of laneList) {
    const rows = rowDefs.filter((r) => r.laneId === lane.id);
    const top = y;
    y += padLane;
    rows.forEach((r, i) => { r.y = y; y += r.h + (i < rows.length - 1 ? (o.gapYRows?.[i] ?? o.gapY) : 0); });
    y += padLane;
    laneBands.push({ id: lane.id, label: lane.label, y: top, h: y - top });
    y += lanes ? o.laneGap : 0;
  }
  const height = Math.ceil(y - (lanes ? o.laneGap : 0) + (lanes ? o.margin : (o.outerY ?? 30)));
  rowDefs.forEach((r) => rowY.set(`${r.laneId}|${r.slot}`, r));
  const boxes = nodes.map((n) => {
    const ci = cols.indexOf(n.col);
    const r = rowY.get(`${n.laneId}|${n.slot}`);
    const cj = n.spanTo === undefined ? ci : cols.indexOf(n.spanTo);
    return { id: n.id, kind: n.kind ?? 'default', x: colX[ci], y: r.y, w: colX[cj] + colW[cj] - colX[ci], h: r.h, laneId: n.laneId, col: ci, row: rowDefs.indexOf(r) };
  });
  return { boxes, laneBands, laneStrip, width, height, colX, colW, rowDefs, cols };
}

// ---------------------------------------------------------------------------------------------
// Ports, tracks and routing
// ---------------------------------------------------------------------------------------------

function chooseSides(e, a, b) {
  if (e.fromSide && e.toSide) return [e.fromSide, e.toSide];
  const dc = b.col - a.col;
  const dr = b.row - a.row;
  if (dc === 0) return dr >= 0 ? ['bottom', 'top'] : ['top', 'bottom'];
  if (dr === 0 || Math.abs(dc) >= 1) return dc > 0 ? [e.fromSide ?? 'right', e.toSide ?? 'left'] : [e.fromSide ?? 'left', e.toSide ?? 'right'];
  return ['right', 'left'];
}

function assignPorts(spec, boxes, o) {
  const byId = new Map(boxes.map((b) => [b.id, b]));
  const ends = [];
  spec.edges.forEach((e, idx) => {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) throw new Error(`Edge ${idx} refers to an unknown node (${e.from} -> ${e.to})`);
    const [fs, ts] = chooseSides(e, a, b);
    ends.push({ idx, box: a, side: fs, other: b, role: 'from' }, { idx, box: b, side: ts, other: a, role: 'to' });
  });
  const groups = new Map();
  for (const en of ends) {
    const k = `${en.box.id}|${en.side}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(en);
  }
  for (const list of groups.values()) {
    const horizontal = SIDES[list[0].side].axis === 'y';
    const b0 = list[0].box;
    const lo = (horizontal ? b0.y : b0.x) + 10;
    const hi = (horizontal ? b0.y + b0.h : b0.x + b0.w) - 10;
    // wanted coordinate: centre of the span shared with the other box (straight line), else its direction
    list.forEach((en, i) => {
      const o2 = en.other;
      const a1 = horizontal ? o2.y : o2.x;
      const a2 = a1 + (horizontal ? o2.h : o2.w);
      const s1 = Math.max(lo, a1 + 10);
      const s2 = Math.min(hi, a2 - 10);
      en.want = s1 <= s2 ? (s1 + s2) / 2 : (a1 + a2) / 2 < (lo + hi) / 2 ? lo + (hi - lo) * 0.2 : lo + (hi - lo) * 0.8;
      en.order = i;
      // fromAt / toAt (0..1) pin a port to a fraction of the usable side length
      const frac = spec.edges[en.idx][en.role === 'from' ? 'fromAt' : 'toAt'];
      if (frac !== undefined) en.want = lo + (hi - lo) * frac;
    });
    list.sort((p, q) => p.want - q.want || p.idx - q.idx);
    const sep = list.length > 1 ? Math.min(o.portSep ?? 16, (hi - lo) / (list.length - 1)) : 0;
    for (let i = 1; i < list.length; i += 1) list[i].want = Math.max(list[i].want, list[i - 1].want + sep);
    for (let i = list.length - 2; i >= 0; i -= 1) if (list[list.length - 1].want > hi) list[i].want = Math.min(list[i].want, list[i + 1].want - sep);
    list.forEach((en) => {
      const s = SIDES[en.side];
      const b = en.box;
      const c = round1(Math.min(hi, Math.max(lo, en.want)));
      const pt = horizontal
        ? { x: s.vx > 0 ? b.x + b.w : b.x, y: c }
        : { x: c, y: s.vy > 0 ? b.y + b.h : b.y };
      en.port = pt;
      const spec_e = spec.edges[en.idx];
      const stubLen = (en.role === 'from' ? spec_e.stubFrom : spec_e.stubTo) ?? o.stub;
      en.stubPt = { x: pt.x + s.vx * stubLen, y: pt.y + s.vy * stubLen };
      en.dir = DIRS.findIndex(([dx, dy]) => dx === s.vx && dy === s.vy);
    });
  }
  const out = spec.edges.map(() => ({}));
  for (const en of ends) out[en.idx][en.role] = en;
  return out;
}

function gutterTracks(lo, hi, spacing) {
  if (hi < lo) return [];
  const n = Math.floor((hi - lo) / spacing) + 1;
  const first = (lo + hi) / 2 - ((n - 1) * spacing) / 2;
  return Array.from({ length: n }, (_, i) => round1(first + i * spacing));
}

function buildAxes(grid, o, ports) {
  const xs = new Set();
  const ys = new Set();
  const { colX, colW, rowDefs } = grid;
  const spans = [];
  spans.push([grid.laneStrip ? o.margin + grid.laneStrip + 6 : 6, colX[0] - o.clearance]);
  for (let i = 0; i + 1 < colX.length; i += 1) spans.push([colX[i] + colW[i] + o.clearance, colX[i + 1] - o.clearance]);
  spans.push([colX[colX.length - 1] + colW[colW.length - 1] + o.clearance, grid.width - 6]);
  spans.forEach(([lo, hi]) => gutterTracks(lo, hi, o.trackGap).forEach((v) => xs.add(v)));
  const ySpans = [[6, rowDefs[0].y - o.clearance]];
  for (let i = 0; i + 1 < rowDefs.length; i += 1) ySpans.push([rowDefs[i].y + rowDefs[i].h + o.clearance, rowDefs[i + 1].y - o.clearance]);
  ySpans.push([rowDefs[rowDefs.length - 1].y + rowDefs[rowDefs.length - 1].h + o.clearance, grid.height - 6]);
  ySpans.forEach(([lo, hi]) => gutterTracks(lo, hi, o.trackGap).forEach((v) => ys.add(v)));
  for (const p of ports) for (const en of [p.from, p.to]) {
    xs.add(en.port.x); xs.add(en.stubPt.x); ys.add(en.port.y); ys.add(en.stubPt.y);
  }
  const sort = (s) => [...s].sort((a, b) => a - b);
  return { xs: sort(xs), ys: sort(ys) };
}

/** Extra cost for a segment that runs closer than o.hug to a box side, so lines keep off box edges. */
function hugPenalty(seg, boxes, o) {
  const vertical = seg.x1 === seg.x2;
  const len = Math.abs(seg.x2 - seg.x1) + Math.abs(seg.y2 - seg.y1);
  let cost = 0;
  for (const b of boxes) {
    const lo = vertical ? Math.min(seg.y1, seg.y2) : Math.min(seg.x1, seg.x2);
    const hi = lo + len;
    const b0 = vertical ? b.y : b.x;
    const b1 = b0 + (vertical ? b.h : b.w);
    if (hi <= b0 || lo >= b1) continue;
    const at = vertical ? seg.x1 : seg.y1;
    const s0 = vertical ? b.x : b.y;
    const s1 = s0 + (vertical ? b.w : b.h);
    if (at > s0 && at < s1) continue;
    const dist = Math.min(Math.abs(at - s0), Math.abs(at - s1));
    if (dist < o.hug) cost += ((o.hug - dist) / o.hug) * (Math.min(hi, b1) - Math.max(lo, b0)) * o.hugCost;
  }
  return cost;
}

function routeEdge(start, goal, startDir, ctx) {
  const { xs, ys, obstacles, existing, o, boxes } = ctx;
  const xi = new Map(xs.map((v, i) => [v, i]));
  const yi = new Map(ys.map((v, i) => [v, i]));
  const si = xi.get(start.x);
  const sj = yi.get(start.y);
  const gi = xi.get(goal.x);
  const gj = yi.get(goal.y);
  if ([si, sj, gi, gj].some((v) => v === undefined)) throw new Error('Router: port coordinates missing from the track grid');
  const key = (i, j, d) => ((i * ys.length) + j) * 4 + d;
  const heap = new MinHeap();
  const cost = new Map();
  const prev = new Map();
  const startKey = key(si, sj, startDir);
  cost.set(startKey, 0);
  heap.push(0, [si, sj, startDir]);
  const h = (i, j) => Math.abs(xs[i] - xs[gi]) + Math.abs(ys[j] - ys[gj]);
  while (heap.size > 0) {
    const [i, j, d] = heap.pop();
    const k = key(i, j, d);
    const c = cost.get(k);
    if (i === gi && j === gj) {
      const pts = [];
      let cur = k;
      while (cur !== undefined) {
        const node = prev.get(cur);
        const ci = Math.floor(cur / 4 / ys.length);
        const cj = Math.floor(cur / 4) % ys.length;
        pts.push({ x: xs[ci], y: ys[cj] });
        cur = node;
      }
      return pts.reverse();
    }
    for (let nd = 0; nd < 4; nd += 1) {
      if (nd === (d ^ 1)) continue;
      const ni = i + DIRS[nd][0];
      const nj = j + DIRS[nd][1];
      if (ni < 0 || nj < 0 || ni >= xs.length || nj >= ys.length) continue;
      const seg = { x1: xs[i], y1: ys[j], x2: xs[ni], y2: ys[nj] };
      if (obstacles.some((r) => segHitsRect(seg, r))) continue;
      let add = Math.abs(seg.x2 - seg.x1) + Math.abs(seg.y2 - seg.y1) + (nd === d ? 0 : o.bendCost);
      add += hugPenalty(seg, boxes, o);
      for (const ex of existing) {
        const rel = segRelation(seg, ex);
        if (rel === 'overlap') add += 400;
        else if (rel === 'cross') add += 50;
      }
      const nk = key(ni, nj, nd);
      const nc = c + add;
      if (nc < (cost.get(nk) ?? Infinity)) {
        cost.set(nk, nc);
        prev.set(nk, k);
        heap.push(nc + h(ni, nj), [ni, nj, nd]);
      }
    }
  }
  return null;
}

function simplify(points) {
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i += 1) {
    const a = out[out.length - 1];
    const b = points[i];
    const c = points[i + 1];
    if ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) continue;
    out.push(b);
  }
  out.push(points[points.length - 1]);
  return out;
}

function headRect(tip, dirIdx, o) {
  const [dx, dy] = DIRS[dirIdx];
  const bx = tip.x - dx * o.head;
  const by = tip.y - dy * o.head;
  return { x: Math.min(tip.x, bx) - (dy !== 0 ? o.headHalf : 0), y: Math.min(tip.y, by) - (dx !== 0 ? o.headHalf : 0), w: dx !== 0 ? o.head : 2 * o.headHalf, h: dy !== 0 ? o.head : 2 * o.headHalf };
}

function placeLabel(points, size, blockers, o, bounds, labelAt, labelSide, labelShift = 0, tight = false, onLine = false) {
  const segs = toSegments(points).map((s, i, all) => ({ ...s, i, len: Math.abs(s.x2 - s.x1) + Math.abs(s.y2 - s.y1), isEnd: i === 0 || i === all.length - 1 }));
  const order = [...segs].sort((a, b) => (a.isEnd - b.isEnd) || b.len - a.len);
  // labelAt tries one segment first: 'start' or 'end' (next to the source or target box) or a segment index
  const first = labelAt === 'start' ? segs[0] : labelAt === 'end' ? segs[segs.length - 1] : segs[labelAt];
  if (first) {
    order.splice(order.findIndex((s) => s.i === first.i), 1);
    order.unshift(first);
  }
  for (const s of order) {
    const horizontal = s.y1 === s.y2;
    const lo = horizontal ? Math.min(s.x1, s.x2) : Math.min(s.y1, s.y2);
    const need = (horizontal ? size.w : size.h) + 8 + (s.isEnd && !tight ? o.head + 2 : 0);
    if (s.len < need) continue;
    const start = labelShift;
    const sweep = [start];
    for (let k = 6; k < s.len; k += 6) sweep.push(start - k, start + k);
    for (const off of sweep) {
      const centre = lo + s.len / 2 + off;
      // options.labelOnLine centres the label on its own line, so it cannot be mistaken for a neighbour's
      const cands = (o.labelOnLine || onLine)
        ? [horizontal ? { x: centre - size.w / 2, y: s.y1 - size.h / 2 } : { x: s.x1 - size.w / 2, y: centre - size.h / 2 }]
        : horizontal
          ? [{ x: centre - size.w / 2, y: s.y1 - o.labelGap - size.h }, { x: centre - size.w / 2, y: s.y1 + o.labelGap }]
          : [{ x: s.x1 + o.labelGap + 1, y: centre - size.h / 2 }, { x: s.x1 - o.labelGap - 1 - size.w, y: centre - size.h / 2 }];
      // labelSide 'left' (or 'top') asks for the label on that side of its line first
      if (labelSide === 'left' || labelSide === 'top') cands.reverse();
      for (const c of cands) {
        const r = { x: round1(c.x), y: round1(c.y), w: size.w, h: size.h };
        const box = inflate(r, o.labelClear ?? 2);
        if (r.x < 2 || r.y < 2 || r.x + r.w > bounds.w - 2 || r.y + r.h > bounds.h - 2) continue;
        const along = horizontal ? [r.x, r.x + r.w] : [r.y, r.y + r.h];
        if (along[0] < lo + 2 || along[1] > lo + s.len - 2) continue;
        if (blockers.rects.some((b) => rectsIntersect(box, b))) continue;
        if (blockers.segs.some((sg) => segHitsRect(sg, box))) continue;
        return r;
      }
    }
  }
  return null;
}

function routeAll(spec, boxes, grid, o, text, ports, labelsAsObstacles) {
  const obstacles = boxes.map((b) => inflate(b, o.clearance));
  for (const band of grid.laneBands) if (grid.laneStrip) obstacles.push({ x: 0, y: band.y, w: o.margin + grid.laneStrip, h: band.h });
  const { xs, ys } = buildAxes(grid, o, ports);
  const fixedSegs = [];
  const heads = [];
  ports.forEach((p) => {
    fixedSegs.push({ x1: p.from.port.x, y1: p.from.port.y, x2: p.from.stubPt.x, y2: p.from.stubPt.y });
    fixedSegs.push({ x1: p.to.stubPt.x, y1: p.to.stubPt.y, x2: p.to.port.x, y2: p.to.port.y });
    heads.push(headRect(p.to.port, p.to.dir ^ 1, o));
  });
  const order = spec.edges.map((e, i) => i).sort((a, b) => {
    const d = (i) => Math.abs(ports[i].from.stubPt.x - ports[i].to.stubPt.x) + Math.abs(ports[i].from.stubPt.y - ports[i].to.stubPt.y);
    return d(a) - d(b) || a - b;
  });
  const routed = new Array(spec.edges.length);
  const routedSegs = [];
  const labelRects = [];
  const labels = new Array(spec.edges.length).fill(null);
  const existing = () => [...fixedSegs, ...routedSegs];
  const laneEdgeRects = o.avoidLaneEdges
    ? grid.laneBands.filter((b) => b.id !== null).flatMap((b) => [b.y, b.y + b.h].map((y) => ({ x: 0, y: y - 2.5, w: grid.width, h: 5 })))
    : [];
  const labelSize = (e) => {
    const m = text.metrics.label;
    return { w: Math.ceil(text.labelW.get(e)) + 2 * o.labelPad, h: Math.ceil(m.asc + m.desc) + 4 };
  };
  // a segment lying on the label's own line (path or its stubs) is not a blocker when the label sits on the line
  const onPath = (sg, pts) => toSegments(pts).some((t) => (sg.x1 === sg.x2 && t.x1 === t.x2 && sg.x1 === t.x1
    && Math.min(sg.y1, sg.y2) >= Math.min(t.y1, t.y2) && Math.max(sg.y1, sg.y2) <= Math.max(t.y1, t.y2))
    || (sg.y1 === sg.y2 && t.y1 === t.y2 && sg.y1 === t.y1
    && Math.min(sg.x1, sg.x2) >= Math.min(t.x1, t.x2) && Math.max(sg.x1, sg.x2) <= Math.max(t.x1, t.x2)));
  const blockersFor = (own, edgeOnLine = false) => ({
    rects: [...boxes.map((b) => inflate(b, 1)), ...heads, ...labelRects, ...obstacles.slice(boxes.length), ...laneEdgeRects],
    segs: [...fixedSegs, ...routedSegs].filter((sg) => !((o.labelOnLine || edgeOnLine) && own && onPath(sg, own))),
  });
  for (const idx of order) {
    const p = ports[idx];
    const e = spec.edges[idx];
    const path = routeEdge(p.from.stubPt, p.to.stubPt, p.from.dir, {
      xs, ys, o, boxes, existing: existing(), obstacles: labelsAsObstacles ? [...obstacles, ...labelRects.map((r) => inflate(r, 3))] : obstacles,
    });
    if (!path) throw new Error(`Diagram: no route for edge ${e.from} -> ${e.to}. Add gap, move a node, or set fromSide/toSide.`);
    const pts = simplify([p.from.port, ...path, p.to.port]);
    routed[idx] = pts;
    routedSegs.push(...toSegments(pts));
    if (e.label && labelsAsObstacles) {
      const r = placeLabel(pts, labelSize(e), blockersFor(pts, e.onLine), o, { w: grid.width, h: grid.height }, e.labelAt, e.labelSide, e.labelShift, e.labelTight, e.onLine);
      if (!r) throw new Error(`Diagram: no free spot for label "${e.label}" (${e.from} -> ${e.to}).`);
      labels[idx] = r;
      labelRects.push(r);
    }
  }
  if (!labelsAsObstacles) {
    for (const idx of order) {
      const e = spec.edges[idx];
      if (!e.label) continue;
      const r = placeLabel(routed[idx], labelSize(e), blockersFor(routed[idx], e.onLine), o, { w: grid.width, h: grid.height }, e.labelAt, e.labelSide, e.labelShift, e.labelTight, e.onLine);
      if (!r) throw new Error(`Diagram: no free spot for label "${e.label}" (${e.from} -> ${e.to}).`);
      labels[idx] = r;
      labelRects.push(r);
    }
  }
  return { routed, labels };
}

// ---------------------------------------------------------------------------------------------
// Validation (pure geometry, used by layoutDiagram and by the self tests)
// ---------------------------------------------------------------------------------------------

export function validateModel(model) {
  const problems = [];
  const { boxes, labels, edges } = model;
  for (let i = 0; i < boxes.length; i += 1) for (let j = i + 1; j < boxes.length; j += 1) {
    if (rectsIntersect(boxes[i], boxes[j], 0.5)) problems.push(`boxes overlap: ${boxes[i].id} / ${boxes[j].id}`);
  }
  for (let i = 0; i < labels.length; i += 1) {
    for (let j = i + 1; j < labels.length; j += 1) if (rectsIntersect(labels[i], labels[j], 0.5)) problems.push(`labels overlap: ${labels[i].text} / ${labels[j].text}`);
    for (const b of boxes) if (rectsIntersect(labels[i], b, 0.5)) problems.push(`label "${labels[i].text}" overlaps box ${b.id}`);
    const l = labels[i];
    if (l.x < 0 || l.y < 0 || l.x + l.w > model.width || l.y + l.h > model.height) problems.push(`label "${l.text}" leaves the canvas`);
  }
  const byId = new Map(boxes.map((b) => [b.id, b]));
  for (const e of edges) {
    const first = e.points[0];
    const last = e.points[e.points.length - 1];
    if (!onBoundary(first, byId.get(e.from))) problems.push(`edge ${e.from}->${e.to} starts off the box edge`);
    if (!onBoundary(last, byId.get(e.to))) problems.push(`edge ${e.from}->${e.to} ends off the box edge`);
    const segs = toSegments(e.points);
    segs.forEach((s) => {
      if (s.x1 !== s.x2 && s.y1 !== s.y2) problems.push(`edge ${e.from}->${e.to} has a diagonal segment`);
      for (const b of boxes) if (segHitsRect(s, inflate(b, -0.5))) problems.push(`edge ${e.from}->${e.to} crosses box ${b.id}`);
      for (const l of labels) if (!((model.labelOnLine || l.onLine) && l.edge === e.id) && segHitsRect(s, inflate(l, 0.5))) problems.push(`edge ${e.from}->${e.to} crosses label "${l.text}"`);
      for (const pt of [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }]) {
        if (pt.x < 0 || pt.y < 0 || pt.x > model.width || pt.y > model.height) problems.push(`edge ${e.from}->${e.to} leaves the canvas`);
      }
    });
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------
// SVG emit
// ---------------------------------------------------------------------------------------------

function textEl(x, y, str, f, fill, attrs) {
  return `<text x="${round1(x)}" y="${round1(y)}" font-family="${f.family}" font-weight="${f.weight}" font-size="${f.size}" fill="${fill}" ${attrs}>${esc(str)}</text>`;
}

/** Path data for an edge where each horizontal run hops (small arc) over the vertical runs of other edges it crosses. */
function hopPath(edge, edges, r) {
  const others = edges.filter((x) => x !== edge).flatMap((x) => toSegments(x.points)).filter((t) => t.x1 === t.x2);
  let d = `M${edge.points[0].x} ${edge.points[0].y}`;
  for (const s of toSegments(edge.points)) {
    if (s.y1 !== s.y2) { d += ` L${s.x2} ${s.y2}`; continue; }
    const dir = Math.sign(s.x2 - s.x1);
    const lo = Math.min(s.x1, s.x2);
    const hi = Math.max(s.x1, s.x2);
    const xs = others
      .filter((t) => t.x1 > lo + r + 1 && t.x1 < hi - r - 1 && s.y1 > Math.min(t.y1, t.y2) && s.y1 < Math.max(t.y1, t.y2))
      .map((t) => t.x1).sort((a, b) => dir * (a - b));
    for (const x of xs) d += ` L${x - dir * r} ${s.y1} A${r} ${r} 0 0 ${dir > 0 ? 1 : 0} ${x + dir * r} ${s.y1}`;
    d += ` L${s.x2} ${s.y2}`;
  }
  return d;
}

/** options.legendPanel: a key drawn in the empty first column, with the real stroke patterns (not CSS look alikes). */
function legendPanel(o, grid, edges, m) {
  const cfg = o.legendPanel;
  const x = grid.colX[0];
  const y = grid.rowDefs[cfg.row ?? 1].y;
  const w = grid.colW[0];
  const rowH = 30;
  const items = cfg.items;
  const h = 14 + 22 + items.length * rowH + 8;
  const sw = 32;
  const out = [`<g class="legend-panel"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="#ffffff" stroke="${PALETTE.deep}" stroke-width="1.4"/>`];
  out.push(textEl(x + 12, y + 14 + m.lane.asc, 'KEY', o.fonts.lane, PALETTE.deep, 'class="legend-title"'));
  items.forEach((it, i) => {
    const cy = y + 14 + 22 + i * rowH + rowH / 2;
    const lx = x + 12;
    if (it.line) {
      const st = { ...EDGE_STYLES[it.line], ...(o.edgeStyles?.[it.line] ?? {}) };
      const tipX = lx + sw;
      out.push(`<path d="M${lx} ${cy} L${tipX} ${cy}" fill="none" stroke="${st.color}" stroke-width="${st.width}" stroke-linecap="${st.cap}"${st.dash ? ` stroke-dasharray="${st.dash}"` : ''}/>`);
      out.push(`<polygon points="${tipX + o.head},${cy} ${tipX},${cy - o.headHalf} ${tipX},${cy + o.headHalf}" fill="${st.color}"/>`);
    } else {
      const ks = { ...(KIND_STYLES[it.box] ?? KIND_STYLES.default), ...(o.kindStyles?.[it.box] ?? {}) };
      if (o.boxCues && it.box === 'external') ks.dash = '6 3';
      out.push(`<rect x="${lx}" y="${cy - 9}" width="${sw + o.head}" height="18" rx="4" fill="${ks.fill}" stroke="${ks.stroke}" stroke-width="${ks.sw}"${ks.dash ? ` stroke-dasharray="${ks.dash}"` : ''}/>`);
      if (o.boxCues && it.box === 'store') out.push(`<rect x="${lx + 3}" y="${cy - 6}" width="${sw + o.head - 6}" height="12" rx="2" fill="none" stroke="${ks.stroke}" stroke-width="1"/>`);
    }
    out.push(textEl(lx + sw + o.head + 10, cy + (o.fonts.label.size * 0.35), it.text, o.fonts.label, PALETTE.ink, 'class="legend-text"'));
  });
  out.push('</g>');
  return out.join('');
}

function emitSvg(spec, o, grid, edges, labels, text, width, height, alt) {
  const m = text.metrics;
  const base = (f) => (lh) => (lh - (f.asc + f.desc)) / 2 + f.asc;
  const parts = [];
  parts.push(`<svg class="diagram" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(alt)}">`);
  parts.push(`<title>${esc(alt)}</title>`);
  grid.laneBands.forEach((band, i) => {
    if (band.id === null) return;
    parts.push(`<g class="lane" data-lane="${esc(band.id)}"><rect class="lane-bg" x="${o.margin}" y="${band.y}" width="${width - 2 * o.margin}" height="${band.h}" rx="8" fill="${i % 2 ? PALETTE.laneAlt : PALETTE.lane}" stroke="${PALETTE.rule}" stroke-width="1"/>`);
    const lines = text.laneText.get(band.id);
    lines.forEach((l, k) => parts.push(textEl(o.margin + 10, band.y + 12 + m.lane.asc + k * m.lane.lh, l.text, o.fonts.lane, PALETTE.deep, `class="lane-label" data-lane="${esc(band.id)}"`)));
    parts.push('</g>');
  });
  parts.push('<g class="edges">');
  edges.forEach((e) => {
    const st = { ...EDGE_STYLES[e.style], ...(o.edgeStyles?.[e.style] ?? {}) };
    const [dx, dy] = DIRS[e.endDir];
    const tip = e.points[e.points.length - 1];
    const d = o.hops ? hopPath(e, edges, o.hopR ?? 5) : e.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
    const bx = tip.x - dx * o.head;
    const by = tip.y - dy * o.head;
    const headPts = `${tip.x},${tip.y} ${round1(bx - dy * o.headHalf)},${round1(by + dx * o.headHalf)} ${round1(bx + dy * o.headHalf)},${round1(by - dx * o.headHalf)}`;
    // an edge may ask for a heavier stroke; the dotted pattern then widens its gap so the dots stay separate
    const sw = e.width ?? st.width;
    const dash = e.width && e.style === 'optional' ? `0.1 ${round1(sw * 2.4)}` : st.dash;
    parts.push(`<g class="edge-g"><path class="edge ${e.style}" data-id="${esc(e.id)}" data-from="${esc(e.from)}" data-to="${esc(e.to)}" data-style="${e.style}" d="${d}" fill="none" stroke="${st.color}" stroke-width="${sw}" stroke-linecap="${st.cap}" stroke-linejoin="miter"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`);
    parts.push(`<polygon class="head" data-edge="${esc(e.id)}" points="${headPts}" fill="${st.hollow ? '#ffffff' : st.color}"${st.hollow ? ` stroke="${st.color}" stroke-width="1.4" stroke-linejoin="round"` : ''}/></g>`);
  });
  parts.push('</g><g class="boxes">');
  grid.boxes.forEach((b) => {
    const ks = { ...(KIND_STYLES[b.kind] ?? KIND_STYLES.default), ...(o.kindStyles?.[b.kind] ?? {}) };
    // boxCues: a non colour cue per box type (dashed outline for outside systems, double rule for data stores)
    if (o.boxCues && b.kind === 'external') ks.dash = '6 3';
    parts.push(`<g class="node ${b.kind}"><rect class="box" data-id="${esc(b.id)}" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="8" fill="${ks.fill}" stroke="${ks.stroke}" stroke-width="${ks.sw}"${ks.dash ? ` stroke-dasharray="${ks.dash}"` : ''}/>`);
    if (o.boxCues && b.kind === 'store') parts.push(`<rect class="box-rule" x="${b.x + 3.5}" y="${b.y + 3.5}" width="${b.w - 7}" height="${b.h - 7}" rx="5" fill="none" stroke="${ks.stroke}" stroke-width="1"/>`);
    if (b.kind === 'built') {
      const cx = b.x + b.w - 14, cy = b.y - 10; // sits in the gap above the corner, clear of the border
      parts.push(`<g class="badge"><circle cx="${cx}" cy="${cy}" r="7" fill="${PALETTE.deep}" stroke="#ffffff" stroke-width="1.5"/><path d="M${cx - 3.2} ${cy} L${cx - 0.8} ${cy + 2.6} L${cx + 3.4} ${cy - 2.6}" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></g>`);
    }
    const t = text.nodeText.get(b.id);
    const totalH = t.title.length * m.title.lh + (t.sub.length ? 3 + t.sub.length * m.sub.lh : 0);
    let y = b.y + (b.h - totalH) / 2;
    t.title.forEach((l) => { parts.push(textEl(b.x + o.padX, y + base(m.title)(m.title.lh), l.text, o.fonts.title, PALETTE.ink, `class="t" data-box="${esc(b.id)}"`)); y += m.title.lh; });
    if (t.sub.length) y += 3;
    t.sub.forEach((l) => { parts.push(textEl(b.x + o.padX, y + base(m.sub)(m.sub.lh), l.text, o.fonts.sub, PALETTE.soft, `class="t" data-box="${esc(b.id)}"`)); y += m.sub.lh; });
    parts.push('</g>');
  });
  parts.push('</g><g class="labels">');
  labels.forEach((l) => {
    parts.push(`<g class="label-g"><rect class="lbl" data-edge="${esc(l.edge)}"${l.onLine || o.labelOnLine ? ' data-online="1"' : ''} x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" rx="3" fill="#ffffff" stroke="${PALETTE.rule}" stroke-width="0.8"/>`);
    parts.push(textEl(l.x + o.labelPad, l.y + (l.h - (m.label.asc + m.label.desc)) / 2 + m.label.asc, l.text, o.fonts.label, PALETTE.ink, `class="t" data-lbl="${esc(l.edge)}"`));
    parts.push('</g>');
  });
  if (o.legendPanel) parts.push(legendPanel(o, grid, edges, m));
  parts.push('</g></svg>');
  return parts.join('');
}

// ---------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------

/**
 * spec: {
 *   alt: 'text alternative for the diagram',
 *   lanes?: [{ id, label }],
 *   nodes: [{ id, title, sub?, col, row?, lane?, kind?: 'default'|'primary'|'external'|'store' }],
 *   edges: [{ from, to, label?, style?: 'request'|'response'|'optional', fromSide?, toSide? }],
 *   options?: { gapX, gapY, ... }   // see DEFAULTS
 * }
 * ctx: { measure, maxWidth?, maxHeight?, strict? }
 */
export async function layoutDiagram(spec, ctx) {
  const o = { ...DEFAULTS, ...(spec.options ?? {}) };
  const { fillHeight } = o;
  o.fonts = fontsFor(o);
  const edgesIn = (spec.edges ?? []).map((e, i) => ({ id: e.id ?? `e${i + 1}`, style: 'request', ...e }));
  const full = { ...spec, edges: edgesIn };
  const text = await prepareText(full, o, ctx.measure);
  let grid = computeGrid(full, o, text);
  // spread rows over the page when the diagram would end up short and top heavy
  const rowGaps = grid.rowDefs.length - 1;
  if (fillHeight && grid.height < fillHeight && rowGaps > 0) {
    const extra = Math.min(o.fillMaxExtra, Math.floor((fillHeight - grid.height) / rowGaps));
    if (extra > 0) { o.gapY += extra; grid = computeGrid(full, o, text); }
  }
  if (ctx.maxWidth && grid.width > ctx.maxWidth) {
    throw new Error(`Diagram is ${grid.width}px wide but only ${ctx.maxWidth}px fit the page. Remove a column, shorten labels, or lower gapX.`);
  }
  // options.maxHeight tightens the page limit when the figure also carries a caption and a legend
  const maxHeight = Math.min(ctx.maxHeight ?? Infinity, o.maxHeight ?? Infinity);
  if (Number.isFinite(maxHeight) && grid.height > maxHeight) {
    throw new Error(`Diagram is ${grid.height}px tall but only ${maxHeight}px fit the page. Remove a row or lower gapY.`);
  }
  const ports = assignPorts(full, grid.boxes, o);
  let result;
  try {
    result = routeAll(full, grid.boxes, grid, o, text, ports, o.labelObstacles ?? true);
  } catch (firstError) {
    try {
      result = routeAll(full, grid.boxes, grid, o, text, ports, false);
    } catch {
      throw firstError;
    }
  }
  const edges = edgesIn.map((e, i) => ({ id: e.id, from: e.from, to: e.to, style: e.style, width: e.width, points: result.routed[i], endDir: ports[i].to.dir ^ 1 }));
  const labels = edgesIn.map((e, i) => (result.labels[i] ? { ...result.labels[i], text: e.label, edge: e.id, onLine: !!e.onLine } : null)).filter(Boolean);
  const model = { width: grid.width, height: grid.height, boxes: grid.boxes, lanes: grid.laneBands, edges, labels, labelOnLine: !!o.labelOnLine };
  const problems = validateModel(model);
  if (problems.length > 0 && ctx.strict !== false) throw new Error(`Diagram failed validation:\n - ${problems.join('\n - ')}`);
  const alt = spec.alt ?? 'Diagram';
  const svg = emitSvg(full, o, grid, edges, labels, text, grid.width, grid.height, alt);
  return { svg, alt, width: grid.width, height: grid.height, model, problems };
}
