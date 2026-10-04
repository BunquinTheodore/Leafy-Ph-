// Builds the Leafy documentation PDF.
//   pnpm docs:pdf                 build HTML, run the layout check, render PDF + page PNGs
//   pnpm docs:pdf -- --downloads  also copy the PDF to your Downloads folder
//   flags: --force (render even if the layout check fails), --no-png, --samples (keep 00-sample sections)
//
// Pipeline: sections/*.html + diagrams -> build/Leafy-Plan.html -> layout check (print layout,
// before printing) -> pass 1 PDF to read real heading pages -> final HTML with page numbers ->
// final PDF (tagged, outline) -> metadata -> PNG per page at 110 dpi -> PDF health report.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { BUILD_DIR, ROOT, fontCss, launchBrowser, openFontPage } from './lib/browser.mjs';
import { createBrowserMeasurer } from './lib/measure.mjs';
import {
  SECTIONS_DIR, contentsHtml, coverHtml, expandDiagrams, listSections, processHeadings,
} from './lib/html.mjs';
import {
  destinationPages, exportPng, inspectPdf, openPdf, pageItems, setPdfMetadata,
} from './lib/pdf-tools.mjs';
import { runLayoutCheck } from './layout-check.mjs';

const args = new Set(process.argv.slice(2));
const META = {
  title: 'Leafy: Project plan and documentation',
  author: 'Leafy project team',
  subject: 'Plant leaf disease app (Next.js, FastAPI, PostgreSQL): plan, flows, API, data, design',
  keywords: 'Leafy, DAHON, plant disease, Next.js, FastAPI, PostgreSQL, documentation',
  lang: 'en',
  creator: 'Leafy docs pdf toolchain (HTML + CSS, Chromium)',
  producer: 'Chromium via Playwright',
};
const STATUS = 'App built. Real ML model pending.';
const PDF_PATH = path.join(BUILD_DIR, 'Leafy-Plan.pdf');
const HTML_PATH = path.join(BUILD_DIR, 'Leafy-Plan.html');
const PASS_PATH = path.join(BUILD_DIR, '.pass.pdf');
const PNG_DIR = path.join(BUILD_DIR, 'pages');
const MAX_NUMBER_PASSES = 3;

const log = (msg) => console.log(`docs:pdf  ${msg}`);

function assemble({ coverHtmlText, sectionsHtml, entries, pages }) {
  const tpl = fs.readFileSync(path.join(ROOT, 'template.html'), 'utf8');
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const printCss = fs.readFileSync(path.join(ROOT, 'print.css'), 'utf8');
  return tpl
    .replace('{{TITLE}}', () => esc(META.title))
    .replace('{{AUTHOR}}', () => esc(META.author))
    .replace('{{DESCRIPTION}}', () => esc(META.subject))
    .replace('{{FONTS_CSS}}', () => fontCss())
    .replace('{{PRINT_CSS}}', () => printCss)
    .replace('{{COVER}}', () => coverHtmlText)
    .replace('{{CONTENTS}}', () => contentsHtml(entries, pages))
    .replace('{{SECTIONS}}', () => sectionsHtml);
}

async function loadSections(measure) {
  const list = listSections({ withSamples: args.has('--samples') });
  const used = new Set(['cover', 'contents', 'contents-title']);
  const parts = [];
  const entries = [];
  for (const section of list) {
    const raw = fs.readFileSync(path.join(SECTIONS_DIR, section.file), 'utf8');
    const expanded = await expandDiagrams(raw, section.file, measure);
    const { html, headings } = processHeadings(expanded, section, used);
    parts.push(html);
    entries.push(...headings.filter((h) => !h.off));
  }
  log(`sections: ${list.map((s) => s.file).join(', ')}`);
  return { sectionsHtml: parts.join('\n'), entries };
}

async function renderPdf(browser, htmlText, outFile) {
  fs.mkdirSync(BUILD_DIR, { recursive: true });
  fs.writeFileSync(HTML_PATH, htmlText);
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  try {
    await page.goto(pathToFileURL(HTML_PATH).href);
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(async () => { await document.fonts.ready; });
    const layout = await runLayoutCheck(page);
    return { page, layout, print: () => page.pdf({
      path: outFile, preferCSSPageSize: true, printBackground: true, tagged: true, outline: true, displayHeaderFooter: false,
    }) };
  } catch (error) {
    await page.close();
    throw error;
  }
}

/** Flags headings that are the last thing on their page, using the real PDF text positions. */
async function findStrandedHeadings(pdfFile, entries, pages) {
  const pdf = await openPdf(pdfFile);
  const stranded = [];
  const BOTTOM_MARGIN_PT = 16 * 2.83465 + 4;
  for (const e of entries) {
    const n = pages.get(e.id);
    if (!n) { stranded.push({ page: 0, selector: `#${e.id}`, problem: 'heading has no PDF destination', detail: e.title }); continue; }
    const { items } = await pageItems(pdf, n);
    const needle = e.title.slice(0, 14).toLowerCase();
    const head = items.find((i) => i.str.toLowerCase().includes(needle));
    if (!head) continue;
    const below = items.filter((i) => i.y < head.y - 2 && i.y > BOTTOM_MARGIN_PT);
    if (below.length === 0) stranded.push({ page: n, selector: `#${e.id}`, problem: 'heading stranded at the bottom of a page (real PDF)', detail: e.title });
  }
  return stranded;
}

async function main() {
  const started = Date.now();
  const browser = await launchBrowser();
  try {
    const fontPage = await openFontPage(browser);
    const measure = createBrowserMeasurer(fontPage);
    const { sectionsHtml, entries } = await loadSections(measure);
    const ids = entries.map((e) => e.id);
    const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const coverHtmlText = coverHtml({ status: STATUS, date });
    const base = { coverHtmlText, sectionsHtml, entries };

    // 1. layout check on the print layout, before anything is printed
    let first = await renderPdf(browser, assemble({ ...base, pages: null }), PASS_PATH);
    const report = first.layout.problems;
    fs.writeFileSync(path.join(BUILD_DIR, 'layout-report.json'), JSON.stringify(report, null, 2));
    if (report.length > 0) {
      console.log(JSON.stringify(report, null, 2));
      log(`layout check FAILED with ${report.length} problem(s), see build/layout-report.json`);
      if (!args.has('--force')) {
        await first.page.close();
        process.exitCode = 1;
        return;
      }
    } else {
      log(`layout check passed (about ${first.layout.pages} pages, 0 problems)`);
    }

    // 2. number passes: print, read where headings landed, rebuild until stable
    let pages = null;
    let final;
    for (let pass = 1; pass <= MAX_NUMBER_PASSES; pass += 1) {
      const current = pass === 1 ? first : await renderPdf(browser, assemble({ ...base, pages }), PASS_PATH);
      await current.print();
      await current.page.close();
      const measured = await destinationPages(await openPdf(PASS_PATH), ids);
      const same = pages && ids.every((id) => pages.get(id) === measured.get(id));
      pages = measured;
      log(`pass ${pass}: ${measured.size}/${ids.length} headings located${same ? ', page numbers stable' : ''}`);
      if (same) break;
      if (pass === MAX_NUMBER_PASSES) throw new Error('Contents page numbers did not settle after 3 passes');
    }

    // 3. final render with real numbers (layout checked again, then printed)
    final = await renderPdf(browser, assemble({ ...base, pages }), PASS_PATH);
    if (final.layout.problems.length > 0 && !args.has('--force')) {
      console.log(JSON.stringify(final.layout.problems, null, 2));
      throw new Error('Layout check failed on the final HTML');
    }
    await final.print();
    await final.page.close();
    const printed = fs.readFileSync(PASS_PATH);
    fs.writeFileSync(PDF_PATH, setPdfMetadata(printed, META));
    fs.rmSync(PASS_PATH, { force: true });

    // 4. verify the real PDF
    const check = await openPdf(PDF_PATH);
    const real = await destinationPages(check, ids);
    const wrong = ids.filter((id) => real.get(id) !== pages.get(id));
    if (wrong.length > 0) throw new Error(`Contents page numbers differ from the PDF for: ${wrong.join(', ')}`);
    const stranded = await findStrandedHeadings(PDF_PATH, entries, real);
    if (stranded.length > 0) {
      console.log(JSON.stringify(stranded, null, 2));
      log(`stranded headings found: ${stranded.length}`);
      if (!args.has('--force')) process.exitCode = 1;
    }
    if (!args.has('--no-png')) {
      const files = await exportPng(check, PNG_DIR, 110);
      log(`exported ${files.length} PNG pages to ${path.relative(ROOT, PNG_DIR)} at 110 dpi`);
    }
    const info = await inspectPdf(PDF_PATH);
    fs.writeFileSync(path.join(BUILD_DIR, 'pdf-report.json'), JSON.stringify(info, null, 2));
    log(`PDF ${info.pages} pages (${info.landscapePages} landscape), ${(info.bytes / 1024).toFixed(0)} KB, bookmarks ${info.bookmarks}, links ${info.links}, tagged ${info.tagged}, lang ${info.lang}`);
    log(`fonts embedded: ${info.embeddedFonts.join(', ')}`);
    log(`title "${info.title}", author "${info.author}"`);
    log(`wrote ${PDF_PATH} in ${((Date.now() - started) / 1000).toFixed(1)}s`);

    if (args.has('--downloads')) {
      const target = path.join(os.homedir(), 'Downloads', 'Leafy-Plan.pdf');
      fs.copyFileSync(PDF_PATH, target);
      log(`copied to ${target}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`docs:pdf  ERROR ${error.stack ?? error.message}`);
  process.exit(1);
});
