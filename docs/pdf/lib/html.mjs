// HTML assembly: sections, diagram directives, headings/ids, cover and contents.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { FLOW_HEIGHT, FLOW_WIDTH } from './diagram.mjs';
import { ROOT } from './browser.mjs';

export const SECTIONS_DIR = path.join(ROOT, 'sections');
const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const stripTags = (s) => s.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'section';

/** sections/NN-name.html in numeric order. Sample files (00-sample*) are skipped once real sections exist. */
export function listSections({ withSamples = false } = {}) {
  const files = fs.readdirSync(SECTIONS_DIR).filter((f) => /^\d+-[\w.-]+\.html$/.test(f));
  const parsed = files.map((f) => ({ file: f, num: Number(f.match(/^(\d+)-/)[1]), name: f.replace(/^\d+-/, '').replace(/\.html$/, '') }));
  parsed.sort((a, b) => a.num - b.num || a.file.localeCompare(b.file));
  const real = parsed.filter((p) => !/^00-sample/.test(p.file));
  const chosen = withSamples || real.length === 0 ? parsed : real;
  // Display numbers are consecutive in reading order, whatever gaps the file prefixes have.
  return chosen.map((s, i) => ({ ...s, num: i + 1 }));
}

function orientationAt(text, index) {
  const before = text.slice(0, index);
  const m = [...before.matchAll(/<section\b[^>]*class="([^"]*)"/g)].pop();
  return m && /\blandscape\b/.test(m[1]) ? 'landscape' : 'portrait';
}

/** Replaces `<!-- @diagram diagrams/x.mjs -->` with a figure containing the generated inline SVG. */
export async function expandDiagrams(html, file, measure) {
  const re = /<!--\s*@diagram\s+([^\s]+?)(?:\s+caption="([^"]*)")?\s*-->/g;
  let out = '';
  let last = 0;
  for (const m of html.matchAll(re)) {
    const orientation = orientationAt(html, m.index);
    const modPath = path.resolve(ROOT, m[1]);
    if (!modPath.startsWith(ROOT)) throw new Error(`${file}: diagram path must stay inside docs/pdf (${m[1]})`);
    const mod = await import(pathToFileURL(modPath).href);
    const ctx = { measure, orientation, maxWidth: FLOW_WIDTH[orientation], maxHeight: FLOW_HEIGHT[orientation] };
    let result;
    try {
      result = await mod.default(ctx);
    } catch (error) {
      throw new Error(`${file}: diagram ${m[1]} failed: ${error.message}`);
    }
    const svg = typeof result === 'string' ? result : result.svg;
    const caption = m[2] ? `<figcaption>${escHtml(m[2])}</figcaption>` : '';
    const boxes = typeof result === 'string' ? null : result.model?.boxes;
    const body = boxes?.length
      ? `<div class="flow-inner" style="width:${result.width}px">${svg}</div>${caption}`
      : `${svg}${caption}`;
    out += `${html.slice(last, m.index)}<figure class="flow-svg">${body}</figure>`;
    last = m.index + m[0].length;
  }
  return out + html.slice(last);
}

/** Adds ids to h1/h2, fills {{num}} and returns { html, headings }. */
export function processHeadings(html, section, used) {
  const headings = [];
  const text = html.replaceAll('{{num}}', String(section.num).padStart(2, '0'));
  const out = text.replace(/<(h[12])([^>]*)>([\s\S]*?)<\/\1>/g, (all, tag, attrs, inner) => {
    const title = stripTags(inner);
    let id = /\sid="([^"]+)"/.exec(attrs)?.[1];
    let a = attrs;
    if (!id) {
      id = `${tag === 'h1' ? 's' : 'h'}${String(section.num).padStart(2, '0')}-${slug(title)}`;
      let unique = id;
      for (let i = 2; used.has(unique); i += 1) unique = `${id}-${i}`;
      id = unique;
      a = `${attrs} id="${id}"`;
    }
    used.add(id);
    const off = /data-toc="off"/.test(attrs);
    headings.push({ level: tag === 'h1' ? 1 : 2, title, id, num: section.num, off });
    return `<${tag}${a}>${inner}</${tag}>`;
  });
  return { html: out, headings };
}

export function contentsHtml(entries, pages) {
  const row = (e) => {
    const label = String(pages?.get(e.id) ?? 0).padStart(2, '0');
    const num = e.level === 1 ? String(e.num).padStart(2, '0') : '';
    return `<li class="${e.level === 1 ? 'toc-main' : 'toc-sub'}"><a class="toc-row toc-link" href="#${e.id}"><span class="toc-num">${num}</span><span class="toc-title">${escHtml(e.title)}</span><span class="toc-page">${label}</span></a></li>`;
  };
  // One group per section so a section's entries stay together in a column.
  const groups = [];
  for (const e of entries) {
    const last = groups[groups.length - 1];
    if (last && last.num === e.num) last.items.push(e);
    else groups.push({ num: e.num, items: [e] });
  }
  // A long section is cut into chunks that never break across a column or page, and every
  // chunk after the first opens with a "(continued)" heading row so no entry loses its parent.
  const CHUNK_ROWS = 8;
  const continuedRow = (g) => {
    const head = g.items[0];
    return `<li class="toc-main toc-cont"><a class="toc-row toc-link" href="#${head.id}"><span class="toc-num">${String(head.num).padStart(2, '0')}</span><span class="toc-title">${escHtml(head.title)} <span class="toc-more">(continued)</span></span><span class="toc-page"></span></a></li>`;
  };
  // Weights are row heights in units of one sub row (about 28 px on screen); a section head row is taller.
  const HEAD_WEIGHT = 1.45;
  const SUB_WEIGHT = 1;
  const GROUP_GAP_WEIGHT = 0.4;
  const CONTINUED_EXTRA_WEIGHT = 0.7;
  const FIRST_PAGE_COLUMN_CAPACITY = 33;
  const NEXT_PAGE_COLUMN_CAPACITY = 36;
  const group = (g) => {
    const subs = g.items.slice(1);
    const chunks = [];
    const chunkCount = Math.ceil(subs.length / CHUNK_ROWS);
    const chunkSize = Math.ceil(subs.length / Math.max(chunkCount, 1));
    for (let i = 0; i < subs.length; i += chunkSize) chunks.push(subs.slice(i, i + chunkSize));
    if (!chunks.length) chunks.push([]);
    return chunks.map((chunk, i) => {
      const rows = i === 0 ? [row(g.items[0]), ...chunk.map(row)] : [continuedRow(g), ...chunk.map(row)];
      const weight = HEAD_WEIGHT + (i === 0 ? 0 : CONTINUED_EXTRA_WEIGHT) + chunk.length * SUB_WEIGHT + GROUP_GAP_WEIGHT;
      return { html: `<li class="toc-group"><ul>${rows.join('')}</ul></li>`, weight };
    });
  };
  // Cut a run of blocks into two columns where the heights are closest.
  const splitColumns = (blocks) => {
    const total = blocks.reduce((sum, b) => sum + b.weight, 0);
    let best = { at: blocks.length, tallest: total, gap: total };
    let left = 0;
    for (let at = 1; at < blocks.length; at += 1) {
      left += blocks[at - 1].weight;
      const gap = Math.abs(total - 2 * left);
      if (gap < best.gap) best = { at, tallest: Math.max(left, total - left), gap };
    }
    return best;
  };
  // Fill each page close to capacity; among the nearly full runs take the one whose two columns
  // end at the most similar height.
  const MIN_FILL = 0.8;
  const allBlocks = groups.flatMap(group);
  const tocPages = [];
  for (let start = 0; start < allBlocks.length;) {
    const capacity = tocPages.length === 0 ? FIRST_PAGE_COLUMN_CAPACITY : NEXT_PAGE_COLUMN_CAPACITY;
    const fits = [];
    for (let end = start + 1; end <= allBlocks.length; end += 1) {
      const split = splitColumns(allBlocks.slice(start, end));
      if (split.tallest > capacity && end > start + 1) break;
      fits.push({ end, gap: split.gap, tallest: split.tallest });
    }
    const full = fits.filter((f) => f.tallest >= capacity * MIN_FILL);
    const pool = full.length ? full : [fits[fits.length - 1]];
    const pick = pool.reduce((a, f) => (f.gap < a.gap ? f : a), pool[0]);
    tocPages.push(allBlocks.slice(start, pick.end));
    start = pick.end;
  }
  const pageHtml = (blocks, i) => {
    const { at } = splitColumns(blocks);
    const col = (list) => `<ol class="toc">${list.map((b) => b.html).join('')}</ol>`;
    const cols = `<div class="toc-cols">${col(blocks.slice(0, at))}${col(blocks.slice(at))}</div>`;
    const heading = i ? '<h2 class="toc-continued" data-toc="off">Contents (continued)</h2>' : '';
    const note = i < tocPages.length - 1 ? '<p class="toc-next">Continued on next page</p>' : '';
    return `${heading}${cols}${note}`;
  };
  const lists = tocPages.map(pageHtml);
  return `<section class="sheet portrait contents" id="contents">
<header class="section-head"><p class="eyebrow">Navigate</p><h1 data-toc="off" id="contents-title">Contents</h1>
<p class="lede">Every line is a link. Bookmarks in your PDF viewer follow the same order.</p></header>
${lists.join('')}
</section>`;
}

export function veinSvg() {
  const branches = [];
  for (let i = 0; i < 11; i += 1) {
    const x = 120 + i * 55;
    const reach = 40 + Math.sin((i / 10) * Math.PI) * 78;
    branches.push(`<path d="M${x} 150 C${x + 22} ${150 - reach * 0.4} ${x + 48} ${150 - reach * 0.8} ${x + 80} ${150 - reach}"/>`);
    branches.push(`<path d="M${x} 150 C${x + 22} ${150 + reach * 0.4} ${x + 48} ${150 + reach * 0.8} ${x + 80} ${150 + reach}"/>`);
  }
  return `<svg class="vein" viewBox="0 0 800 300" role="img" aria-label="Decorative leaf veins" preserveAspectRatio="xMidYMid meet" fill="none" stroke-linecap="round">
<path d="M20 150 C200 -12 600 -12 780 150 C600 312 200 312 20 150 Z" stroke="#6fcf8a" stroke-opacity="0.9" stroke-width="2.6"/>
<g stroke="#3fae5b" stroke-width="1.6" opacity="0.9">${branches.join('')}</g>
<path d="M20 150 C250 138 560 162 780 150" stroke="#40c057" stroke-width="3"/>
<circle cx="780" cy="150" r="5" fill="#7be495" stroke="none"/>
</svg>`;
}

export function coverHtml({ status, date }) {
  const mark = fs.readFileSync(path.join(ROOT, 'assets', 'leafy-mark-on-dark.svg'), 'utf8')
    .replace(/<\?xml[^>]*>/, '').replace(/ width="\d+" height="\d+"/, '');
  const tpl = fs.readFileSync(path.join(ROOT, 'cover.html'), 'utf8');
  return tpl.replace('{{MARK}}', mark).replace('{{VEIN}}', veinSvg()).replace('{{STATUS}}', escHtml(status)).replace('{{DATE}}', escHtml(date));
}
