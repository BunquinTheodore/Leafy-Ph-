// Sequence diagram helper (used by the section 6 diagrams, not a diagram module itself).
// Participants are boxes across the top with dashed lifelines. Every message is a horizontal arrow between two small
// activation boxes that sit on the lifelines, so the output uses the same markup the layout check already verifies
// (rect.box, path.edge, polygon.head, rect.lbl): arrow ends touch box edges, labels never touch arrows or boxes.
// Spacing between lifelines is computed from the measured label widths, so a label always fits between its two ends.
import { EDGE_STYLES, PALETTE } from '../lib/diagram.mjs';

const CODE_FONT = { family: '"Cascadia Mono", Consolas, monospace', weight: 500, size: 12 };
// Two size tiers: the roomy tier is tried first, the compact tier (still 12px labels, 9pt) only when the page is too short.
const makeFonts = (text) => ({
  title: { family: 'Poppins', weight: 600, size: 13 },
  sub: { family: 'Manrope', weight: 500, size: 12 },
  label: { family: 'Poppins', weight: 500, size: text },
  note: { family: 'Manrope', weight: 500, size: text },
  tab: { family: 'Poppins', weight: 600, size: 12 },
  code: CODE_FONT,
});
const TIERS = [13.5, 13, 12.5, 12];
const css = (f) => `${f.weight} ${f.size}px ${f.family}`;
const isCode = (w) => /^`[^`\s]+`$/.test(w);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r1 = (n) => Math.round(n * 10) / 10;

const KINDS = {
  default: { fill: PALETTE.paper, stroke: PALETTE.brand, sw: 1.4 },
  primary: { fill: PALETTE.tint, stroke: PALETTE.deep, sw: 2 },
  external: { fill: '#f3f5f3', stroke: PALETTE.soft, sw: 1.4 },
  store: { fill: '#fbf7ec', stroke: PALETTE.amber, sw: 1.6 },
};
const HEAD = 9;
const HEAD_HALF = 4.5;
const ACT_W = 8;
const ACT_H = 6;
const MARGIN = 8;
const LABEL_H = 20;
const LABEL_GAP = 8; // label bottom to arrow line
const ROW_MAX = 74; // message pitch: as roomy as the page allows, shrinking only when the diagram would not fit
const ROW_MIN = 34; // never below this: previous arrow to next label stays at least 7px
const SEQ_MAX_HEIGHT = 552; // page budget when the legend sits in the heading row
const NOTE_GAP = 14;
const NOTE_AFTER_HEAD = 28; // header boxes to a note that opens the diagram
const BANNER_GAP = 32; // frame or else banner to the first label below it
const ELSE_ABOVE = 16; // last arrow of a branch to the next else divider // free space below a note box
const NOTE_ABOVE = 24; // arrow to the note box below it
const NOTE_CLEAR = 20; // a note box never ends closer than this to a lifeline it does not cover
const NOTE_PADX = 12;
const NOTE_PADY = 8;
const BOTTOM_PAD = 12; // lifelines end this far above the bottom edge of the svg
const LIFELINE = '#6b7a70'; // thin solid grey, never the dashed response pattern
const FRAME_LINE = '#a9c4ad'; // thin solid, never the dashed response pattern
const LIFE_GAP = 4; // lifelines stop this far from a note or a frame heading
const ASYNC_DASH = '0.1 5.5'; // round dots 2.4px wide, 5.5px apart
const RESPONSE_DASH = '9 5';

async function wrapBalanced(measure, text, f, limit) {
  const first = await wrapText(measure, text, f, limit);
  if (first.length < 2) return first;
  let best = first;
  for (let lim = limit - 8; lim > limit * 0.5; lim -= 8) {
    const trial = await wrapText(measure, text, f, lim);
    if (trial.length !== first.length) break;
    best = trial;
  }
  return best;
}

async function wrapText(measure, text, f, limit) {
  const words = text.split(/\s+/).filter(Boolean).map((w) => (isCode(w) ? { t: w.slice(1, -1), code: true } : { t: w, code: false }));
  const fontOf = (w) => css(w.code ? CODE_FONT : f);
  const req = [...words.map((w) => ({ text: w.t, font: fontOf(w) })), { text: ' ', font: css(f) }];
  const res = await measure(req);
  const space = res[words.length].w;
  const lines = [];
  let cur = [];
  let curW = 0;
  words.forEach((w, i) => {
    const ww = res[i].w;
    if (cur.length && curW + space + ww > limit) { lines.push({ words: cur, w: curW }); cur = [w]; curW = ww; } else { curW = cur.length ? curW + space + ww : ww; cur.push(w); }
  });
  if (cur.length) lines.push({ words: cur, w: curW });
  return lines.map((l) => ({ text: l.words.map((w) => w.t).join(' '), words: l.words, w: l.w }));
}

function stretchSpacing(d, pairs) {
  const out = [...d];
  for (let pass = 0; pass < 4; pass += 1) {
    for (const { a, b, need } of pairs) {
      let sum = 0;
      for (let k = a; k < b; k += 1) sum += out[k];
      if (sum < need) {
        const add = (need - sum) / (b - a);
        for (let k = a; k < b; k += 1) out[k] += add;
      }
    }
  }
  return out;
}

/**
 * spec: { alt, participants: [{ id, title, sub?, kind? }],
 *         items: [ {t:'msg', from, to, label, style?} | {t:'note', over: id|[id,id], text}
 *                | {t:'frame', label} | {t:'else', label} | {t:'end'} ] }
 */
export async function sequenceDiagram(spec, ctx) {
  let lastError;
  for (const text of TIERS) {
    try {
      return await buildSequence(spec, ctx, makeFonts(text));
    } catch (error) {
      if (!/but only/.test(error.message)) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

async function buildSequence(spec, ctx, FONTS) {
  const { measure } = ctx;
  const maxW = ctx.maxWidth ?? 980;
  const parts = spec.participants;
  const index = new Map(parts.map((p, i) => [p.id, i]));
  const msgs = spec.items.filter((i) => i.t === 'msg');
  const startAt = spec.startAt ?? 1;
  msgs.forEach((m, i) => { m.n = startAt + i; });

  // measure everything once
  const headLines = await Promise.all(parts.map(async (p) => ({
    title: await wrapText(measure, p.title, FONTS.title, 150),
    sub: p.sub ? await wrapText(measure, p.sub, FONTS.sub, 150) : [],
  })));
  const labelText = (m) => `${m.n} ${m.label}`;
  const labelRes = await measure(msgs.map((m) => ({ text: labelText(m), font: css(FONTS.label) })));
  const frameTexts = spec.items.filter((i) => i.t === 'frame' || i.t === 'else');
  const frameRes = await measure(frameTexts.map((i) => ({ text: i.label, font: css(FONTS.tab) })));
  const frameW = new Map(frameTexts.map((i, k) => [i, Math.ceil(frameRes[k].w)]));
  const metrics = await measure(Object.values(FONTS).map((f) => ({ text: 'Hg', font: css(f) })));
  const lh = (k) => Math.ceil(metrics[Object.keys(FONTS).indexOf(k)].asc + metrics[Object.keys(FONTS).indexOf(k)].desc) + 2;
  const titleLh = lh('title');
  const subLh = lh('sub');
  const noteLh = lh('note');
  const labelAsc = metrics[Object.keys(FONTS).indexOf('label')];

  const widths = headLines.map((h) => Math.max(110, Math.ceil(Math.max(...h.title.map((l) => l.w), ...h.sub.map((l) => l.w))) + 24));
  const headH = Math.max(...headLines.map((h) => 14 + h.title.length * titleLh + (h.sub.length ? 3 + h.sub.length * subLh : 0)));

  // lifeline spacing
  let d = parts.slice(1).map((_, i) => (widths[i] + widths[i + 1]) / 2 + 24);
  const pairs = msgs.map((m, i) => {
    const a = index.get(m.from);
    const b = index.get(m.to);
    if (a === undefined || b === undefined || a === b) throw new Error(`sequence: bad message ${m.n} (${m.from} -> ${m.to})`);
    return { a: Math.min(a, b), b: Math.max(a, b), need: Math.ceil(labelRes[i].w) + 10 + ACT_W + 28 };
  });
  const lastGapNeeds = msgs.map((m, i) => {
    const a = index.get(m.from);
    const b = index.get(m.to);
    return Math.abs(a - b) > 1 ? { a: Math.max(a, b) - 1, b: Math.max(a, b), need: Math.ceil(labelRes[i].w) + 24 } : null;
  }).filter(Boolean);
  const widthOf = (dd) => MARGIN * 2 + widths[0] / 2 + widths[parts.length - 1] / 2 + dd.reduce((sum, v) => sum + v, 0);
  d = stretchSpacing(d, pairs);
  const withGaps = stretchSpacing(d, lastGapNeeds);
  if (widthOf(withGaps) <= maxW) d = withGaps;
  // even lifelines when that still fits
  const widest = Math.max(...d);
  for (const share of [1, 0.9, 0.8, 0.7]) {
    const evened = d.map((v) => Math.max(v, widest * share));
    if (widthOf(evened) <= maxW) { d = evened; break; }
  }
  const baseWidth = MARGIN * 2 + widths[0] / 2 + widths[parts.length - 1] / 2 + d.reduce((s, v) => s + v, 0);
  if (baseWidth > maxW) throw new Error(`sequence: needs ${Math.ceil(baseWidth)}px but only ${maxW}px fit. Shorten labels or drop a participant.`);
  const stretch = Math.min(1.35, (maxW - 4) / baseWidth);
  d = d.map((v) => v * (1 + (stretch - 1) * 0.9));
  const cx = [];
  let x = MARGIN + widths[0] / 2;
  parts.forEach((_, i) => { cx.push(r1(x)); x += d[i] ?? 0; });
  const width = Math.ceil(cx[cx.length - 1] + widths[parts.length - 1] / 2 + MARGIN);

  // notes: a note either sits between its two lifelines with NOTE_CLEAR to each, or deliberately covers them
  const noteInfo = new Map();
  for (const it of spec.items.filter((i) => i.t === 'note')) {
    const ids = Array.isArray(it.over) ? it.over : [it.over];
    const a = index.get(ids[0]);
    const b = index.get(ids[ids.length - 1]);
    const NOTE_MIN = 230;
    const NOTE_MAX = 560;
    const between = ids.length > 1 && cx[b] - cx[a] - 2 * NOTE_CLEAR >= NOTE_MIN - 30;
    let nw;
    let nx;
    if (ids.length === 1) {
      nw = 270;
      nx = cx[a] - nw / 2;
    } else if (between) {
      nw = Math.min(NOTE_MAX, cx[b] - cx[a] - 2 * NOTE_CLEAR);
      nx = (cx[a] + cx[b]) / 2 - nw / 2;
    } else {
      nw = Math.min(NOTE_MAX, Math.max(NOTE_MIN, cx[b] - cx[a] + 2 * NOTE_CLEAR));
      nx = (cx[a] + cx[b]) / 2 - nw / 2;
    }
    nx = Math.max(MARGIN, Math.min(nx, width - MARGIN - nw));
    // a lifeline that is not covered must stay NOTE_CLEAR away: cover it instead of touching it
    let x0 = nx;
    let x1 = nx + nw;
    for (let pass = 0; pass < 3; pass += 1) {
      for (const c of cx) {
        if (c < x0 && x0 - c < NOTE_CLEAR) x0 = Math.max(MARGIN, c - NOTE_CLEAR);
        if (c > x1 && c - x1 < NOTE_CLEAR) x1 = Math.min(width - MARGIN, c + NOTE_CLEAR);
      }
    }
    nx = x0;
    nw = x1 - x0;
    const lines = await wrapBalanced(measure, it.text, FONTS.note, nw - 2 * NOTE_PADX);
    noteInfo.set(it, { x: nx, w: nw, lines, h: lines.length * noteLh + 2 * NOTE_PADY });
  }

  // vertical layout, repeated with a tighter message pitch only when the page budget needs it
  const labelGap = spec.labelGap ?? LABEL_GAP;
  const labelH = spec.labelH ?? LABEL_H;
  const layoutRows = (rowPitch) => {
    let y = 6;
    const headTop = y;
    y += headH + 6;
    const rows = [];
    const frames = [];
    const stack = [];
    let lastArrowY = -Infinity;
    y += 4;
    for (const it of spec.items) {
      if (it.t === 'msg') {
        const top = y;
        rows.push({ it, top, ay: top + labelH + labelGap });
        lastArrowY = top + labelH + labelGap;
        y += rowPitch;
      } else if (it.t === 'note') {
        const info = noteInfo.get(it);
        y = Math.max(y, lastArrowY + NOTE_ABOVE, headTop + headH + NOTE_AFTER_HEAD);
        rows.push({ it, top: y, info });
        y += info.h + NOTE_GAP;
      } else if (it.t === 'frame') {
        y += 4;
        const fr = { label: it.label, top: y, w: frameW.get(it), dividers: [] };
        stack.push(fr);
        frames.push(fr);
        y += BANNER_GAP;
      } else if (it.t === 'else') {
        const fr = stack[stack.length - 1];
        y += ELSE_ABOVE;
        fr.dividers.push({ y, label: it.label, w: frameW.get(it) });
        y += BANNER_GAP;
      } else if (it.t === 'end') {
        const fr = stack.pop();
        y += 2;
        fr.bottom = y;
        y += 4;
      }
    }
    return { rows, frames, headTop, height: Math.ceil(y + BOTTOM_PAD) };
  };
  let rowPitch = ROW_MAX;
  let laid = layoutRows(rowPitch);
  while (laid.height > SEQ_MAX_HEIGHT && rowPitch > (spec.rowMin ?? ROW_MIN)) {
    rowPitch -= 1;
    laid = layoutRows(rowPitch);
  }
  const { rows, frames, headTop, height } = laid;
  const lifeTop = headTop + headH;

  const out = [];
  out.push(`<svg class="diagram" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(spec.alt)}"><title>${esc(spec.alt)}</title>`);
  const fx0 = MARGIN;
  const fx1 = width - MARGIN;
  out.push('<g class="frames">');
  const cuts = []; // areas where lifelines stop: note boxes only (frame tabs are drawn above the lifelines)
  for (const fr of frames) {
    out.push(`<rect class="frame-rect" x="${fx0}" y="${fr.top}" width="${fx1 - fx0}" height="${fr.bottom - fr.top}" rx="6" fill="none" stroke="${FRAME_LINE}" stroke-width="1"/>`);
    for (const dv of fr.dividers) {
      out.push(`<line x1="${fx0}" y1="${dv.y}" x2="${fx1}" y2="${dv.y}" stroke="${FRAME_LINE}" stroke-width="1"/>`);
    }
  }
  for (const row of rows.filter((r) => r.it.t === 'note')) {
    cuts.push({ x0: row.info.x, x1: row.info.x + row.info.w, y0: row.top, y1: row.top + row.info.h });
  }
  out.push('</g><g class="lifelines">');
  parts.forEach((p, i) => {
    const hits = cuts.filter((c) => cx[i] >= c.x0 - 2 && cx[i] <= c.x1 + 2).sort((m, n) => m.y0 - n.y0);
    let from = lifeTop;
    const end = height - BOTTOM_PAD + 2;
    const seg = (y0, y1) => { if (y1 - y0 > 2) out.push(`<line class="lifeline" x1="${cx[i]}" y1="${r1(y0)}" x2="${cx[i]}" y2="${r1(y1)}" stroke="${LIFELINE}" stroke-width="1.25"/>`); };
    void hits;
    seg(from, end);
  });
  out.push('</g><g class="frame-tabs">');
  const tabAt = (label, w, ty) => {
    out.push(`<rect class="frame-tab" x="${fx0 + 8}" y="${ty + 4}" width="${w + 16}" height="20" rx="4" fill="#f7faf6" stroke="${FRAME_LINE}" stroke-width="1"/>`);
    out.push(`<text x="${fx0 + 16}" y="${ty + 18.5}" font-family="Poppins" font-weight="600" font-size="${FONTS.tab.size}" fill="${PALETTE.deep}">${esc(label)}</text>`);
  };
  for (const fr of frames) {
    tabAt(fr.label, fr.w, fr.top);
    for (const dv of fr.dividers) tabAt(dv.label, dv.w, dv.y);
  }
  // a label sits mid arrow, or inside one gap between lifelines when the arrow crosses a lifeline it does not end on
  const labelCenter = (a, b, lw) => {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const mid = (cx[a] + cx[b]) / 2;
    const clear = (c) => cx.slice(lo + 1, hi).every((v) => v < c - lw / 2 - 6 || v > c + lw / 2 + 6);
    if (hi - lo < 2 || clear(mid)) return mid;
    const gaps = [];
    for (let k = lo; k < hi; k += 1) gaps.push((cx[k] + cx[k + 1]) / 2);
    const fit = gaps.filter((c) => clear(c) && c - lw / 2 > cx[lo] + 4 && c + lw / 2 < cx[hi] - 4);
    // prefer the gap next to the receiving lifeline, then the one closest to the middle
    const ordered = fit.sort((p, q) => Math.abs(p - mid) - Math.abs(q - mid));
    return ordered.length ? ordered[0] : mid;
  };
  out.push('</g><g class="edges">');
  const boxes = [];
  const labels = [];
  for (const row of rows.filter((r) => r.it.t === 'msg')) {
    const m = row.it;
    const a = index.get(m.from);
    const b = index.get(m.to);
    const dir = cx[b] > cx[a] ? 1 : -1;
    const x1 = r1(cx[a] + dir * (ACT_W / 2));
    const x2 = r1(cx[b] - dir * (ACT_W / 2));
    const base = EDGE_STYLES[m.style ?? 'request'];
    const st = m.style === 'optional'
      ? { ...base, dash: ASYNC_DASH, width: 2.4 }
      : m.style === 'response' ? { ...base, dash: RESPONSE_DASH, width: 2 } : base;
    const ay = row.ay;
    const bx = x2 - dir * HEAD;
    const head = `${x2},${ay} ${r1(bx)},${r1(ay + HEAD_HALF)} ${r1(bx)},${r1(ay - HEAD_HALF)}`;
    const id = `e${m.n}`;
    out.push(`<g class="edge-g"><path class="edge ${m.style ?? 'request'}" data-id="${id}" data-from="${id}a" data-to="${id}b" data-style="${m.style ?? 'request'}" d="M${x1} ${ay} L${x2} ${ay}" fill="none" stroke="${st.color}" stroke-width="${st.width}" stroke-linecap="${st.cap}"${st.dash ? ` stroke-dasharray="${st.dash}"` : ''}/>`);
    out.push(`<polygon class="head" data-edge="${id}" points="${head}" fill="${st.color}"/></g>`);
    boxes.push({ id: `${id}a`, x: cx[a] - ACT_W / 2, y: ay - ACT_H / 2, w: ACT_W, h: ACT_H });
    boxes.push({ id: `${id}b`, x: cx[b] - ACT_W / 2, y: ay - ACT_H / 2, w: ACT_W, h: ACT_H });
    const lw = Math.ceil(labelRes[m.n - startAt].w) + 10;
    labels.push({ id, text: labelText(m), x: r1(labelCenter(a, b, lw) - lw / 2), y: row.top, w: lw, h: labelH });
  }
  out.push('</g><g class="boxes">');
  parts.forEach((p, i) => {
    const ks = KINDS[p.kind ?? 'default'];
    const bx = r1(cx[i] - widths[i] / 2);
    out.push(`<g class="node ${p.kind ?? 'default'}"><rect class="box" data-id="p-${esc(p.id)}" x="${bx}" y="${headTop}" width="${widths[i]}" height="${headH}" rx="8" fill="${ks.fill}" stroke="${ks.stroke}" stroke-width="${ks.sw}"/>`);
    const h = headLines[i];
    const total = h.title.length * titleLh + (h.sub.length ? 3 + h.sub.length * subLh : 0);
    let ty = headTop + (headH - total) / 2;
    h.title.forEach((l) => { out.push(`<text x="${r1(cx[i])}" y="${r1(ty + titleLh - 4)}" text-anchor="middle" font-family="Poppins" font-weight="600" font-size="${FONTS.title.size}" fill="${PALETTE.ink}" class="t" data-box="p-${esc(p.id)}">${esc(l.text)}</text>`); ty += titleLh; });
    if (h.sub.length) ty += 3;
    h.sub.forEach((l) => { out.push(`<text x="${r1(cx[i])}" y="${r1(ty + subLh - 4)}" text-anchor="middle" font-family="Manrope" font-weight="500" font-size="${FONTS.sub.size}" fill="${PALETTE.soft}" class="t" data-box="p-${esc(p.id)}">${esc(l.text)}</text>`); ty += subLh; });
    out.push('</g>');
  });
  boxes.forEach((b) => out.push(`<g class="node act"><rect class="box" data-id="${b.id}" x="${r1(b.x)}" y="${r1(b.y)}" width="${b.w}" height="${b.h}" rx="1.5" fill="${PALETTE.paper}" stroke="${PALETTE.deep}" stroke-width="1.4"/></g>`));
  let ni = 0;
  for (const row of rows.filter((r) => r.it.t === 'note')) {
    ni += 1;
    const { info } = row;
    const id = `n${ni}`;
    out.push(`<g class="node note"><rect class="box" data-id="${id}" x="${r1(info.x)}" y="${r1(row.top)}" width="${r1(info.w)}" height="${info.h}" rx="5" fill="#fffdf3" fill-opacity="0.9" stroke="${PALETTE.amber}" stroke-width="1"/>`);
    info.lines.forEach((l, k) => {
      const spans = l.words.map((w, wi) => `<tspan${w.code ? ` font-family="${CODE_FONT.family.replace(/"/g, '')}" font-size="${CODE_FONT.size}" fill="${PALETTE.deep}"` : ''}>${esc(w.t)}${wi < l.words.length - 1 ? ' ' : ''}</tspan>`).join('');
      out.push(`<text x="${r1(info.x + NOTE_PADX)}" y="${r1(row.top + NOTE_PADY + noteLh * k + noteLh - 4)}" font-family="Manrope" font-weight="500" font-size="${FONTS.note.size}" fill="${PALETTE.ink}" class="t" data-box="${id}">${spans}</text>`);
    });
    out.push('</g>');
  }
  out.push('</g><g class="labels">');
  const lblAscent = labelAsc.asc;
  const lblDescent = labelAsc.desc;
  labels.forEach((l) => {
    out.push(`<g class="label-g"><rect class="lbl" data-edge="${l.id}" x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" rx="3" fill="#ffffff" stroke="${PALETTE.rule}" stroke-width="0.8"/>`);
    out.push(`<text x="${r1(l.x + 5)}" y="${r1(l.y + (l.h - (lblAscent + lblDescent)) / 2 + lblAscent)}" font-family="Poppins" font-weight="500" font-size="${FONTS.label.size}" fill="${PALETTE.ink}" class="t" data-lbl="${l.id}">${esc(l.text)}</text></g>`);
  });
  out.push('</g></svg>');
  if (height > SEQ_MAX_HEIGHT) throw new Error(`sequence: ${height}px tall but only ${SEQ_MAX_HEIGHT}px fit`);
  return { svg: out.join(''), alt: spec.alt, width, height };
}
