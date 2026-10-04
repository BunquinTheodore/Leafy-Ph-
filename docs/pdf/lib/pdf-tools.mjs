// PDF reading and post processing: heading page numbers, text positions, PNG export,
// metadata (incremental update, no extra dependency) and a short health report.

import fs from 'node:fs';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';

let pdfjsPromise;
const pdfjs = () => {
  pdfjsPromise ??= import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjsPromise;
};

export async function openPdf(file) {
  const lib = await pdfjs();
  const data = new Uint8Array(fs.readFileSync(file));
  return lib.getDocument({ data, useSystemFonts: false, isEvalSupported: false, verbosity: 0 }).promise;
}

/** Map of heading id -> 1 based page number, read from the named destinations Chromium writes for links. */
export async function destinationPages(pdf, ids) {
  const pages = new Map();
  for (const id of ids) {
    const dest = await pdf.getDestination(id);
    if (!dest) continue;
    const ref = dest[0];
    const index = typeof ref === 'object' && ref !== null ? await pdf.getPageIndex(ref) : ref;
    pages.set(id, index + 1);
  }
  return pages;
}

/** Text items with page coordinates (PDF points, origin bottom left). */
export async function pageItems(pdf, pageNumber) {
  const page = await pdf.getPage(pageNumber);
  const view = page.view;
  const content = await page.getTextContent();
  return {
    width: view[2] - view[0],
    height: view[3] - view[1],
    items: content.items.filter((i) => i.str.trim()).map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], h: i.height })),
  };
}

export async function pageSizes(pdf) {
  const out = [];
  for (let n = 1; n <= pdf.numPages; n += 1) {
    const page = await pdf.getPage(n);
    out.push({ page: n, width: page.view[2] - page.view[0], height: page.view[3] - page.view[1] });
  }
  return out;
}

/** Export every page as PNG at the given dpi. Returns the written file names. */
export async function exportPng(pdf, outDir, dpi = 110) {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const scale = dpi / 72;
  const files = [];
  for (let n = 1; n <= pdf.numPages; n += 1) {
    const page = await pdf.getPage(n);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
    const context = canvas.getContext('2d');
    await page.render({ canvasContext: context, viewport, canvas }).promise;
    const name = `page-${String(n).padStart(2, '0')}.png`;
    fs.writeFileSync(path.join(outDir, name), canvas.toBuffer('image/png'));
    files.push(name);
  }
  return files;
}

// ---------------------------------------------------------------------------------------------
// Metadata: append an incremental update that replaces the Info dictionary and adds /Lang
// ---------------------------------------------------------------------------------------------

const pdfString = (s) => {
  const ascii = /^[\x20-\x7e]*$/.test(s);
  if (ascii) return `(${s.replace(/([()\\])/g, '\\$1')})`;
  const bytes = [0xfe, 0xff];
  for (const ch of s) {
    const code = ch.codePointAt(0);
    if (code > 0xffff) { const c = code - 0x10000; bytes.push(0xd8 + (c >> 18), (c >> 10) & 0xff, 0xdc + ((c >> 8) & 3), c & 0xff); } else bytes.push(code >> 8, code & 0xff);
  }
  return `<${Buffer.from(bytes).toString('hex')}>`;
};

function lastObject(text, num) {
  const re = new RegExp(`(?:^|[\\r\\n])${num} 0 obj([\\s\\S]*?)endobj`, 'g');
  let m;
  let last;
  while ((m = re.exec(text)) !== null) last = m[1];
  return last;
}

/** Returns a new Buffer with Title/Author/Subject/Keywords/Creator/Producer set and /Lang on the catalog. */
export function setPdfMetadata(buffer, meta) {
  const text = buffer.toString('latin1');
  const startxref = [...text.matchAll(/startxref\s+(\d+)\s+%%EOF/g)].pop();
  if (!startxref) throw new Error('PDF metadata: startxref not found');
  const prevOffset = Number(startxref[1]);
  const trailerStart = text.lastIndexOf('trailer');
  const trailer = trailerStart >= 0 ? text.slice(trailerStart, text.indexOf('startxref', trailerStart)) : '';
  if (!trailer) throw new Error('PDF metadata: classic trailer not found (xref stream PDFs are not supported)');
  const size = Number(/\/Size\s+(\d+)/.exec(trailer)[1]);
  const root = /\/Root\s+(\d+)\s+0\s+R/.exec(trailer)[1];
  const id = /\/ID\s*(\[[^\]]*\])/.exec(trailer)?.[1];
  const infoRef = /\/Info\s+(\d+)\s+0\s+R/.exec(trailer)?.[1];
  const infoNum = infoRef ? Number(infoRef) : size;
  const newSize = infoRef ? size : size + 1;

  const oldInfo = infoRef ? lastObject(text, infoRef) ?? '' : '';
  const fields = { Title: meta.title, Author: meta.author, Subject: meta.subject, Keywords: meta.keywords, Creator: meta.creator, Producer: meta.producer };
  let info = '<<';
  for (const [k, v] of Object.entries(fields)) if (v) info += `/${k} ${pdfString(v)}`;
  for (const k of ['CreationDate', 'ModDate']) {
    const m = new RegExp(`/${k}\\s*(\\([^)]*\\))`).exec(oldInfo);
    if (m) info += `/${k} ${m[1]}`;
  }
  info += '>>';

  const catalogBody = lastObject(text, root);
  if (!catalogBody) throw new Error('PDF metadata: catalog object not found');
  let catalog = catalogBody.trim();
  catalog = catalog.replace(/\/Lang\s*(\([^)]*\)|<[^>]*>)/, '');
  catalog = catalog.replace(/>>\s*$/, `/Lang ${pdfString(meta.lang)}>>`);

  let body = '\n';
  const offsets = new Map();
  const append = (num, content) => { offsets.set(num, Buffer.byteLength(text, 'latin1') + Buffer.byteLength(body, 'latin1')); body += `${num} 0 obj\n${content}\nendobj\n`; };
  append(infoNum, info);
  append(Number(root), catalog);
  const xrefOffset = Buffer.byteLength(text, 'latin1') + Buffer.byteLength(body, 'latin1');
  const nums = [...offsets.keys()].sort((a, b) => a - b);
  let xref = 'xref\n';
  for (const n of nums) xref += `${n} 1\n${String(offsets.get(n)).padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<</Size ${newSize}/Root ${root} 0 R/Info ${infoNum} 0 R${id ? `/ID ${id}` : ''}/Prev ${prevOffset}>>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.concat([buffer, Buffer.from(body + xref, 'latin1')]);
}

// ---------------------------------------------------------------------------------------------
// Health report
// ---------------------------------------------------------------------------------------------

export async function inspectPdf(file) {
  const buffer = fs.readFileSync(file);
  const raw = buffer.toString('latin1');
  const pdf = await openPdf(file);
  const meta = await pdf.getMetadata();
  const outline = await pdf.getOutline();
  let links = 0;
  for (let n = 1; n <= pdf.numPages; n += 1) {
    const annots = await (await pdf.getPage(n)).getAnnotations();
    links += annots.filter((a) => a.subtype === 'Link').length;
  }
  const countOutline = (items) => (items ?? []).reduce((s, i) => s + 1 + countOutline(i.items), 0);
  const fonts = [...raw.matchAll(/\/FontName\s*\/([A-Z]{6}\+[^\s/>]+)/g)].map((m) => m[1]);
  const sizes = await pageSizes(pdf);
  return {
    file,
    bytes: buffer.length,
    pages: pdf.numPages,
    landscapePages: sizes.filter((s) => s.width > s.height).length,
    title: meta.info?.Title ?? null,
    author: meta.info?.Author ?? null,
    lang: /\/Lang\s*\(([^)]*)\)/.exec(raw)?.[1] ?? (/\/Lang\s*<feff([0-9a-f]+)>/i.test(raw) ? 'utf16' : null),
    tagged: /\/StructTreeRoot/.test(raw) && /\/Marked\s+true/.test(raw),
    bookmarks: countOutline(outline),
    links,
    embeddedFonts: [...new Set(fonts.map((f) => f.replace(/^[A-Z]{6}\+/, '')))],
    allFontsEmbedded: /\/BaseFont\s*\/[A-Z]{6}\+/.test(raw) && !/\/BaseFont\s*\/(?!([A-Z]{6}\+))(Arial|Helvetica|Times)/.test(raw),
  };
}
