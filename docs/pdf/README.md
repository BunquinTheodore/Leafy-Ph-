# Leafy documentation PDF

HTML + print CSS rendered to PDF by the Chromium that Playwright already downloaded.
Output: `build/Leafy-Plan.pdf` (and `build/pages/page-NN.png` at 110 dpi for review).

```
pnpm install            # once (fonts, playwright, pdf reader); no browser download needed
pnpm docs:pdf           # build HTML, layout check, render PDF, export PNGs
pnpm docs:pdf -- --downloads   # same, then copy the PDF to your Downloads folder
pnpm docs:check         # run only the layout check on build/Leafy-Plan.html (prints JSON)
pnpm test               # self tests for the diagram helper and the layout check
```

Flags for `build.mjs`: `--force` (render even when the layout check fails), `--no-png`,
`--samples` (keep the `00-sample*` sections when real sections exist), `--downloads`.

If Chromium is missing: `pnpm exec playwright install chromium` (or set `PLAYWRIGHT_BROWSERS_PATH`
to the folder that has it; the default is `%LOCALAPPDATA%\ms-playwright`).

## What the build does

1. Reads `sections/NN-name.html` in numeric order, expands diagram directives (below), gives every
   `h1` and `h2` an id, fills `{{num}}`.
2. Adds the dark cover (`cover.html`) and the contents page (links to every `h1`/`h2`).
3. **Layout check** (`layout-check.mjs`) on the print layout, before printing. Any problem fails the build
   and is written to `build/layout-report.json` as `{ page, selector, problem, detail }`.
4. Prints a first PDF to read where each heading really landed (PDF named destinations), rebuilds the
   contents with those page numbers, repeats until stable, then prints the final PDF
   (`printBackground`, tagged, outline = bookmarks, A4, named landscape page).
5. Sets PDF metadata (title, author, subject, keywords, language `en`), verifies the page numbers and
   stranded headings against the real PDF text, exports PNGs, prints a health report
   (`build/pdf-report.json`: pages, fonts, bookmarks, links, tagged).

`page` in the layout report is an estimate from a simulated A4 pagination. Real stranded headings are
re-checked on the PDF itself.

## Authoring conventions

### Files

- One file per topic: `sections/NN-name.html` (`NN` = two digit order, `name` = lowercase words and dashes),
  for example `02-overview.html`, `04-flow-scan.html`. Files with the same `NN` sort by name.
- `00-sample*` files exist only to prove the pipeline. They are skipped automatically as soon as another
  section exists. Delete them when you like.
- A file holds one or more `<section class="sheet ...">` elements. **Every sheet starts a new page.**
  A file is plain HTML (no `<html>`, `<head>`, scripts or inline `<style>`; use the classes below).
- The first sheet of a section starts with:

  ```html
  <section class="sheet portrait">
    <header class="section-head">
      <p class="eyebrow">Section {{num}}</p>
      <h1 class="section-title">Overview</h1>
      <p class="lede">One or two sentences.</p>
    </header>
    <h2>Confirmed decisions</h2>
    ...
  </section>
  ```

  `{{num}}` becomes the file number. `h1` is the section title (contents level 1), `h2` the page or
  block title (contents level 2). Add `data-toc="off"` to keep a heading out of the contents. You may set
  your own `id` on a heading; otherwise one is generated.
- Titles: one line, two at most (the check fails on three). No hyphenation anywhere (`hyphens: none`).
  Avoid hyphenated compound words in copy where plain wording works.

### Sheets and orientation

| Class | Page | Content width | Use |
|---|---|---|---|
| `sheet portrait` | A4 portrait, 16 mm margins | 178 mm | text, cards, tables |
| `sheet landscape` | A4 landscape, 16 mm margins | 265 mm | wide diagrams, one per page |

Landscape sheet: give it an `h2` (the diagram name), then the diagram, then a `.legend`. Do not put more
than one tall diagram on a landscape page (usable height about 178 mm minus title and legend).

### Components

| Class | Markup |
|---|---|
| `.card-grid cols-2` (also `cols-1`, `cols-3`, `cols-4`) | grid of cards, fixed 5 mm gap |
| `.card` (`accent`, `info`, `danger`, `flat`) | `<div class="card"><span class="tag">Auth</span><h3>Title</h3><p>Text</p></div>` |
| `table.table` | `<colgroup>` for widths, `<thead>` repeats on every page, rows never split, 9 pt |
| `.callout` (`note`, `warn`, `danger`) | `<div class="callout note"><span class="callout-title">Title</span><p>Text</p></div>` |
| `.legend` | `<span class="legend-title">Arrows</span><span class="legend-item"><span class="ln"></span>Request</span>` ... `.ln`, `.ln dashed`, `.ln dotted` draw arrow samples |
| `.swatch-grid` + `.swatch` | `<div class="swatch" style="--c:#23813a"><div class="swatch-chip"></div><div class="swatch-meta"><strong>Brand</strong><span>#23813a</span></div></div>` |
| `.storyboard` + `figure.frame` | animation as numbered frames side by side: `<div class="storyboard" style="--frames:4"><figure class="frame"><div class="frame-visual">...</div><figcaption>What happens</figcaption></figure>...</div>` (numbers are automatic) |
| `figure.flow-svg` | wrapper for a diagram (the directive below creates it) |
| `.eyebrow`, `.lede`, `.muted`, `.small`, `code` | small text styles |

Rules the layout check enforces (so write to them): paragraphs left aligned, about 62ch wide; cards,
table rows, callouts, legends, storyboards and figures never split across pages; no negative margins, no
absolute positioning over content; font size at least 8 pt (9 pt in tables, 8 pt in diagrams); nothing
outside the page content box. Arrows use line style plus a label (solid = request, dashed = response or
async, dotted = optional), never colour alone.

Design tokens (colours, spacing, fonts) are CSS variables at the top of `print.css`. Fonts (Josefin Sans
display caps, Poppins headings, Manrope body) are embedded from the local `@fontsource` packages.

### Diagrams

Diagrams are code, not drawings. Put a module in `diagrams/` that default exports an async function and
include it from a section:

```html
<section class="sheet landscape">
  <h2>Flow 4: scan a leaf</h2>
  <!-- @diagram diagrams/flow-scan.mjs caption="Optional caption" -->
  <div class="legend"> ... </div>
</section>
```

```js
// diagrams/flow-scan.mjs
import { layoutDiagram } from '../lib/diagram.mjs';

export default async function flowScan(ctx) {            // ctx: { measure, orientation, maxWidth, maxHeight }
  return layoutDiagram({
    alt: 'Text alternative that describes the whole flow.',
    lanes: [{ id: 'user', label: 'User' }, { id: 'web', label: 'Next.js' }],   // optional horizontal bands
    nodes: [
      { id: 'pick', lane: 'user', col: 0, title: 'Pick photo', sub: 'Camera or file', kind: 'primary' },
      { id: 'send', lane: 'web', col: 1, title: 'POST /scans' },
    ],
    edges: [
      { from: 'pick', to: 'send', label: 'multipart image' },                      // style: request (solid)
      { from: 'send', to: 'pick', label: '202 accepted', style: 'response' },       // dashed
      { from: 'send', to: 'pick', label: 'camera', style: 'optional', fromSide: 'top', toSide: 'top' }, // dotted
    ],
    options: { gapX: 64 },                                                          // optional, see DEFAULTS
  }, ctx);
}
```

- Nodes sit on a grid: `col` (any integers, empty columns collapse) and, inside a lane, `row` (slot, default 0).
  Without `lanes`, `row` is the global row. `kind`: `default`, `primary`, `external`, `store`.
- Box sizes come from measured text (real fonts, canvas measurement), so labels always fit. Long text wraps at
  `maxNodeW` (196 px). Boxes in a column share a width, boxes in a row share a height.
- Edges are routed as orthogonal lines around the boxes (A* over a track grid), ports are spread along each
  side, arrowheads end exactly on the box edge, and labels are placed beside their line, never on it.
  Straight edges between neighbours widen their gutter to fit the label.
- Set `fromSide` / `toSide` (`top|right|bottom|left`) for back edges and loops.
- The layout is validated before it is returned. Too wide or too tall for the page, an unknown node, no route
  or no free label spot throws, and the build stops with the diagram name. Fix by removing a column, shortening
  a label, or lowering `gapX` / `gapY`. Usable size: `FLOW_WIDTH` (980 landscape, 650 portrait) and
  `FLOW_HEIGHT` (540 landscape, 880 portrait) in CSS px. The diagram is never scaled down, so its text stays
  at 11 to 12 px (8 to 9 pt).
- Output SVG carries the data attributes the layout check reads (`rect.box`, `path.edge`, `rect.lbl`,
  `polygon.head`).

Self tests (`pnpm test`) lay out the sample and a denser diagram, assert no overlaps and arrow ends on box
edges, run them through the in-browser check with the real fonts, and prove that deliberately broken layouts
(overlapping boxes, a label on an arrow, an arrow pulled off its box, overflow, clipping, small fonts,
three line titles, stranded headings) are reported.

### Checklist before you hand a section over

1. `pnpm docs:pdf` finishes with `layout check passed` and no stranded headings.
2. Open `build/pages/page-NN.png` for your pages: nothing touches, nothing is cut, hierarchy reads at a glance.
3. Check grayscale: arrows still read by line style and label.

## Files

| File | Purpose |
|---|---|
| `build.mjs` | orchestrates the build (`pnpm docs:pdf`) |
| `layout-check.mjs` | in-browser layout check (also runnable alone) |
| `print.css`, `fonts.css` | design tokens, A4 pages, components, local fonts |
| `template.html`, `cover.html` | document shell and dark cover |
| `sections/` | content, one file per section |
| `diagrams/` | diagram modules (default export `async (ctx) => layoutDiagram(...)`) |
| `lib/diagram.mjs` | layout, routing, SVG emit, validation |
| `lib/geometry.mjs`, `lib/measure.mjs` | geometry helpers, text measurement |
| `lib/html.mjs`, `lib/browser.mjs`, `lib/pdf-tools.mjs` | assembly, browser launch, PDF reading and metadata |
| `assets/` | brand mark SVGs used by the cover |

Dependencies beyond the requested four: `pdfjs-dist` (read heading pages and text positions, render PNGs)
and `@napi-rs/canvas` (prebuilt canvas for the PNG export, no compiler needed).
