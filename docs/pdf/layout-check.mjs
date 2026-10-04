// Layout check. Runs in the browser, on the print layout, BEFORE the PDF is printed.
// It fails on: overlapping sibling boxes, text overflow or clipping, elements crossing the
// page content margins, headings stranded at a page bottom, titles over two lines, font sizes
// below the minimums, and for SVG diagrams: arrow ends off the box edge, arrows crossing a
// label or a box, overlapping arrows, text that does not fit its box.
//
//   node layout-check.mjs [path/to/page.html]   prints a JSON report, exit code 1 on problems
//
// "page" in the report is an estimate from a simulated A4 pagination of the print layout
// (cards, table rows, figures and headings are treated as unbreakable like in the CSS). The
// build verifies stranded headings again on the real PDF text.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BUILD_DIR, launchBrowser } from './lib/browser.mjs';

/* eslint-disable no-undef */
/** Self contained: it is serialised and evaluated inside the page. Do not reference module scope. */
export function layoutCheckInPage(opts = {}) {
  const MM = 96 / 25.4;
  const PT = 96 / 72;
  const MIN_GENERAL = (opts.minGeneralPt ?? 8) * PT;
  const MIN_TABLE = (opts.minTablePt ?? 9) * PT;
  const MIN_SVG = (opts.minSvgPt ?? 8) * PT;
  const EPS = 0.06 * PT;
  const problems = [];

  const sheets = [...document.querySelectorAll('.sheet')];
  const pageMap = new Map();
  const sheetMeta = new Map();

  const selectorOf = (el) => {
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.body && parts.length < 4) {
      const tag = cur.tagName.toLowerCase();
      if (cur.id) { parts.unshift(`${tag}#${cur.id}`); break; }
      const cls = [...cur.classList].slice(0, 2).join('.');
      const index = cur.parentElement ? [...cur.parentElement.children].indexOf(cur) + 1 : 1;
      parts.unshift(`${tag}${cls ? `.${cls}` : ''}:nth-child(${index})`);
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  };
  const sheetOf = (el) => el.closest('.sheet');
  const estPage = (el) => {
    let cur = el;
    while (cur && cur.nodeType === 1) {
      if (pageMap.has(cur)) return pageMap.get(cur);
      cur = cur.parentElement;
    }
    const sh = sheetOf(el);
    const meta = sh && sheetMeta.get(sh);
    if (!meta) return 0;
    return meta.start + Math.max(0, Math.floor((el.getBoundingClientRect().top - meta.top) / meta.H));
  };
  const report = (el, problem, detail) => problems.push({ page: estPage(el), selector: selectorOf(el), problem, detail });

  const inSvg = (el) => el.closest('svg') !== null && el.tagName.toLowerCase() !== 'svg';
  const isBlockish = (el) => {
    const d = getComputedStyle(el).display;
    return !['inline', 'contents', 'none', 'table-cell', 'table-row', 'table-row-group', 'table-header-group', 'table-footer-group', 'table-column', 'table-column-group', 'table-caption'].includes(d);
  };

  // ---------- 1. simulated pagination ----------
  let pageCursor = 1;
  for (const sh of sheets) {
    const cls = sh.classList;
    const cover = cls.contains('cover');
    const landscape = cls.contains('landscape');
    const W = (landscape ? 265 : 178) * MM;
    const H = (landscape ? 178 : 265) * MM;
    const r = sh.getBoundingClientRect();
    const units = [];
    const collect = (root) => {
      for (const el of root.children) {
        if (inSvg(el)) continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none') continue;
        if (cs.display === 'contents') { collect(el); continue; }
        if (cs.position === 'absolute' || cs.position === 'fixed') continue;
        const er = el.getBoundingClientRect();
        if (er.height < 0.5) continue;
        const tag = el.tagName;
        const avoid = cs.breakInside === 'avoid' || cs.breakInside === 'avoid-page';
        const head = /^H[1-6]$/.test(tag);
        const hasBlockChild = [...el.children].some((c) => isBlockish(c));
        const atomic = avoid || head || tag === 'TR' || tag === 'svg' || tag === 'IMG';
        if (atomic || !hasBlockChild) {
          const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5;
          const need = atomic ? er.height : Math.min(er.height, 3 * lh);
          units.push({ el, top: er.top - r.top, bottom: er.bottom - r.top, atomic, head, need, noBreakAfter: /avoid/.test(cs.breakAfter) });
        }
        else collect(el);
      }
    };
    collect(sh);
    units.sort((a, b) => a.top - b.top || a.bottom - b.bottom);
    let shift = 0;
    for (let i = 0; i < units.length;) {
      let j = i;
      while (j < units.length && Math.abs(units[j].top - units[i].top) < 1.5) j += 1;
      const group = units.slice(i, j);
      const maxH = Math.max(0, ...group.map((u) => u.need));
      let eff = units[i].top + shift;
      if (maxH > 0 && maxH <= H) {
        const startPage = Math.floor(eff / H);
        if (Math.floor((eff + maxH - 0.01) / H) > startPage) {
          const delta = (startPage + 1) * H - eff;
          shift += delta;
          eff += delta;
        }
      }
      group.forEach((u) => { u.page = pageCursor + Math.floor(eff / H); pageMap.set(u.el, u.page); });
      i = j;
    }
    const last = units.length ? Math.max(...units.map((u) => u.bottom)) + shift : 0;
    const pages = cover ? 1 : Math.max(1, Math.floor((last - 0.01) / H) + 1);
    sheetMeta.set(sh, { start: pageCursor, pages, H, W, top: r.top, left: r.left, cover, units });
    pageCursor += pages;
  }

  // ---------- 2. stranded headings, atomic taller than page ----------
  for (const sh of sheets) {
    const meta = sheetMeta.get(sh);
    if (meta.cover) continue;
    const { units, H } = meta;
    units.forEach((u, idx) => {
      if (u.atomic && u.bottom - u.top > H + 1) report(u.el, 'taller than the page content area', `${((u.bottom - u.top) / MM).toFixed(1)}mm > ${(H / MM).toFixed(1)}mm`);
      if (!u.head) return;
      const next = units.slice(idx + 1).find((n) => n.top >= u.bottom - 1);
      if (next && next.page > u.page && !u.noBreakAfter) report(u.el, 'heading stranded at the bottom of a page', 'add break-after: avoid or a page break');
    });
  }

  // ---------- 3. sibling overlaps ----------
  const overlaps = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'BR', 'META', 'LINK', 'TITLE', 'COL', 'COLGROUP', 'SOURCE']);
  for (const sh of sheets) {
    const parents = [sh, ...sh.querySelectorAll('*')].filter((p) => !inSvg(p) && p.tagName.toLowerCase() !== 'svg');
    for (const p of parents) {
      const kids = [...p.children].filter((c) => !SKIP_TAGS.has(c.tagName) && !inSvg(c) && isBlockish(c) && c.getBoundingClientRect().width > 0 && c.getBoundingClientRect().height > 0);
      for (let i = 0; i < kids.length; i += 1) {
        const a = kids[i].getBoundingClientRect();
        for (let j = i + 1; j < kids.length; j += 1) {
          if (overlaps(a, kids[j].getBoundingClientRect())) {
            report(kids[i], 'sibling boxes overlap', `${selectorOf(kids[i])} and ${selectorOf(kids[j])}`);
          }
        }
      }
    }
  }

  // ---------- 4. overflow, clipping, margins, titles, font sizes ----------
  for (const sh of sheets) {
    const meta = sheetMeta.get(sh);
    const shr = sh.getBoundingClientRect();
    const all = [sh, ...sh.querySelectorAll('*')].filter((e) => !inSvg(e));
    for (const el of all) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.display === 'contents') continue;
      const tag = el.tagName.toLowerCase();
      if (tag === 'svg') continue;
      const r = el.getBoundingClientRect();
      if (el !== sh && !meta.cover && r.width > 0 && r.height > 0 && isBlockish(el)) {
        if (r.left < shr.left - 0.75 || r.right > shr.right + 0.75) report(el, 'element crosses the page content margins', `left ${(r.left - shr.left).toFixed(1)}px, right ${(r.right - shr.right).toFixed(1)}px`);
      }
      const clips = ['hidden', 'clip', 'auto', 'scroll'].some((v) => cs.overflowX === v || cs.overflowY === v);
      if (el.clientWidth > 0 && isBlockish(el)) {
        if (el.scrollWidth > el.clientWidth + 1) report(el, clips ? 'content is clipped horizontally' : 'content overflows horizontally', `scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}`);
        else if (clips && el.scrollHeight > el.clientHeight + 1) report(el, 'content is clipped vertically', `scrollHeight ${el.scrollHeight} > clientHeight ${el.clientHeight}`);
      }
      if (cs.webkitLineClamp && cs.webkitLineClamp !== 'none') report(el, 'line clamp hides text', cs.webkitLineClamp);
      if (cs.textOverflow === 'ellipsis' && clips) report(el, 'ellipsis truncates text', '');
      if (/^H[12]$/.test(el.tagName)) {
        const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
        const inner = r.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
        const lines = Math.round(inner / lh);
        if (lines > 2) report(el, 'title wraps to more than two lines', `${lines} lines`);
      }
      const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim());
      if (ownText) {
        const px = parseFloat(cs.fontSize);
        const min = el.closest('table') ? MIN_TABLE : MIN_GENERAL;
        if (px < min - EPS) report(el, 'font size below the minimum', `${(px / PT).toFixed(2)}pt < ${(min / PT).toFixed(0)}pt`);
        if (cs.hyphens !== 'none') report(el, 'hyphenation is enabled', cs.hyphens);
        // text node boxes must stay inside the nearest block container
        let box = el;
        while (box && !isBlockish(box)) box = box.parentElement;
        const br = (box ?? el).getBoundingClientRect();
        for (const node of el.childNodes) {
          if (node.nodeType !== 3 || !node.nodeValue.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          const tr = range.getBoundingClientRect();
          const vTol = Math.max(1.5, parseFloat(cs.fontSize) * 0.3);
          if (tr.width > 0 && (tr.left < br.left - 1.5 || tr.right > br.right + 1.5 || tr.top < br.top - vTol || tr.bottom > br.bottom + vTol)) {
            report(el, 'text sits outside its container', `"${node.nodeValue.trim().slice(0, 40)}"`);
            break;
          }
        }
      }
    }
  }

  // ---------- 5. SVG diagrams ----------
  const num = (n) => parseFloat(n);
  const rectOfEl = (e) => ({ x: num(e.getAttribute('x')), y: num(e.getAttribute('y')), w: num(e.getAttribute('width')), h: num(e.getAttribute('height')) });
  const inflate = (r, d) => ({ x: r.x - d, y: r.y - d, w: r.w + 2 * d, h: r.h + 2 * d });
  const rectsHit = (a, b, eps = 0.5) => a.x + a.w - eps > b.x && b.x + b.w - eps > a.x && a.y + a.h - eps > b.y && b.y + b.h - eps > a.y;
  const segHits = (s, r) => {
    if (s.y1 === s.y2) return s.y1 > r.y && s.y1 < r.y + r.h && Math.min(s.x1, s.x2) < r.x + r.w && Math.max(s.x1, s.x2) > r.x;
    return s.x1 > r.x && s.x1 < r.x + r.w && Math.min(s.y1, s.y2) < r.y + r.h && Math.max(s.y1, s.y2) > r.y;
  };
  const onBoundary = (p, r, tol = 0.75) => {
    const outer = p.x >= r.x - tol && p.x <= r.x + r.w + tol && p.y >= r.y - tol && p.y <= r.y + r.h + tol;
    const inner = p.x > r.x + tol && p.x < r.x + r.w - tol && p.y > r.y + tol && p.y < r.y + r.h - tol;
    return outer && !inner;
  };
  for (const svg of document.querySelectorAll('.sheet svg.diagram')) {
    const vb = svg.viewBox.baseVal;
    const scale = svg.getBoundingClientRect().width / vb.width;
    const boxes = [...svg.querySelectorAll('rect.box')].map((e) => ({ el: e, id: e.dataset.id, ...rectOfEl(e) }));
    const labels = [...svg.querySelectorAll('rect.lbl')].map((e) => ({ el: e, id: e.dataset.edge, onLine: e.dataset.online === '1', ...rectOfEl(e) }));
    const byId = new Map(boxes.map((b) => [b.id, b]));
    for (let i = 0; i < boxes.length; i += 1) for (let j = i + 1; j < boxes.length; j += 1) if (rectsHit(boxes[i], boxes[j])) report(boxes[i].el, 'diagram boxes overlap', `${boxes[i].id} / ${boxes[j].id}`);
    for (let i = 0; i < labels.length; i += 1) {
      for (let j = i + 1; j < labels.length; j += 1) if (rectsHit(labels[i], labels[j])) report(labels[i].el, 'diagram labels overlap', `${labels[i].id} / ${labels[j].id}`);
      for (const b of boxes) if (rectsHit(labels[i], b)) report(labels[i].el, 'label overlaps a box', `${labels[i].id} / ${b.id}`);
      const l = labels[i];
      if (l.x < 0 || l.y < 0 || l.x + l.w > vb.width || l.y + l.h > vb.height) report(l.el, 'label leaves the diagram canvas', l.id);
    }
    const allSegs = [];
    for (const path of svg.querySelectorAll('path.edge')) {
      const tokens = (path.getAttribute('d').match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
      const pts = [];
      for (let k = 0; k + 1 < tokens.length; k += 2) pts.push({ x: tokens[k], y: tokens[k + 1] });
      const from = byId.get(path.dataset.from);
      const to = byId.get(path.dataset.to);
      const name = `${path.dataset.from} -> ${path.dataset.to}`;
      if (!from || !to) { report(path, 'arrow refers to a missing box', name); continue; }
      if (!onBoundary(pts[0], from)) report(path, 'arrow start does not touch its box edge', name);
      if (!onBoundary(pts[pts.length - 1], to)) report(path, 'arrow end (arrowhead) does not touch its box edge', name);
      const head = svg.querySelector(`polygon.head[data-edge="${path.dataset.id}"]`);
      if (head) {
        const tip = head.getAttribute('points').split(' ')[0].split(',').map(Number);
        const end = pts[pts.length - 1];
        if (Math.abs(tip[0] - end.x) > 0.75 || Math.abs(tip[1] - end.y) > 0.75) report(path, 'arrowhead tip is not at the arrow end', name);
      }
      for (let k = 1; k < pts.length; k += 1) {
        const s = { x1: pts[k - 1].x, y1: pts[k - 1].y, x2: pts[k].x, y2: pts[k].y, edge: name };
        if (s.x1 !== s.x2 && s.y1 !== s.y2) report(path, 'arrow has a diagonal segment', name);
        allSegs.push(s);
        for (const b of boxes) if (segHits(s, inflate(b, -0.5))) report(path, 'arrow crosses a box', `${name} through ${b.id}`);
        for (const l of labels) if (!(l.onLine && l.id === path.dataset.id) && segHits(s, inflate(l, 0.5))) report(path, 'arrow crosses a label', `${name} through label of ${l.id}`);
        for (const p of [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }]) if (p.x < 0 || p.y < 0 || p.x > vb.width || p.y > vb.height) { report(path, 'arrow leaves the diagram canvas', name); break; }
      }
    }
    for (let i = 0; i < allSegs.length; i += 1) for (let j = i + 1; j < allSegs.length; j += 1) {
      const a = allSegs[i];
      const b = allSegs[j];
      if (a.edge === b.edge) continue;
      const ah = a.y1 === a.y2;
      if (ah !== (b.y1 === b.y2)) continue;
      const near = ah ? Math.abs(a.y1 - b.y1) < 3 : Math.abs(a.x1 - b.x1) < 3;
      const lo = ah ? Math.max(Math.min(a.x1, a.x2), Math.min(b.x1, b.x2)) : Math.max(Math.min(a.y1, a.y2), Math.min(b.y1, b.y2));
      const hi = ah ? Math.min(Math.max(a.x1, a.x2), Math.max(b.x1, b.x2)) : Math.min(Math.max(a.y1, a.y2), Math.max(b.y1, b.y2));
      if (near && hi - lo > 3) report(svg, 'two arrows run on top of each other', `${a.edge} / ${b.edge}`);
    }
    for (const t of svg.querySelectorAll('text')) {
      const bb = t.getBBox();
      const fs = parseFloat(t.getAttribute('font-size')) * scale;
      if (fs < MIN_SVG - EPS) report(t, 'diagram font size below the minimum', `${(fs / PT).toFixed(2)}pt < ${(MIN_SVG / PT).toFixed(0)}pt`);
      const host = t.dataset.box ? byId.get(t.dataset.box) : t.dataset.lbl ? labels.find((l) => l.id === t.dataset.lbl) : null;
      if (host && (bb.x < host.x + 1 - 0.01 || bb.y < host.y + 0.5 - 0.01 || bb.x + bb.width > host.x + host.w - 1 + 0.01 || bb.y + bb.height > host.y + host.h - 0.5 + 0.01)) {
        report(t, 'diagram text does not fit its box', t.textContent.slice(0, 40));
      }
    }
  }

  return { pages: pageCursor - 1, problems };
}
/* eslint-enable no-undef */

/** Runs the check on an already loaded page (print media emulated, fonts ready). */
export async function runLayoutCheck(page, opts = {}) {
  await page.emulateMedia({ media: 'print' });
  await page.evaluate(async () => { await document.fonts.ready; });
  return page.evaluate(layoutCheckInPage, opts);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const target = path.resolve(process.argv[2] ?? path.join(BUILD_DIR, 'Leafy-Plan.html'));
  if (!fs.existsSync(target)) {
    console.error(`layout-check: ${target} not found. Run "pnpm docs:pdf" first.`);
    process.exit(2);
  }
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    await page.goto(pathToFileURL(target).href);
    const result = await runLayoutCheck(page);
    console.log(JSON.stringify(result.problems, null, 2));
    console.error(`layout-check: ${result.problems.length} problem(s) on about ${result.pages} page(s)`);
    process.exitCode = result.problems.length ? 1 : 0;
  } finally {
    await browser.close();
  }
}
