// Self tests for the diagram helper and the layout check.  Run: pnpm test  (node --test lib/)
// 1. pure geometry validation on the sample and on a denser stress diagram (no browser)
// 2. the same diagrams measured with the real fonts and checked by the in-browser layout check
// 3. negative fixtures: deliberately broken layouts must be reported

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { BUILD_DIR, ROOT, fontCss, launchBrowser, openFontPage } from './browser.mjs';
import { layoutDiagram, validateModel } from './diagram.mjs';
import { onBoundary, rectsIntersect } from './geometry.mjs';
import { approxMeasurer, createBrowserMeasurer } from './measure.mjs';
import sample from '../diagrams/sample.mjs';
import { runLayoutCheck } from '../layout-check.mjs';

const stress = {
  alt: 'Stress diagram',
  lanes: [{ id: 'a', label: 'Lane A' }, { id: 'b', label: 'Lane B' }, { id: 'c', label: 'Lane C' }],
  nodes: [
    { id: 'n1', lane: 'a', col: 0, title: 'Start', kind: 'primary' },
    { id: 'n2', lane: 'a', col: 1, title: 'Validate input and store' },
    { id: 'n3', lane: 'a', col: 2, title: 'Done' },
    { id: 'n4', lane: 'b', col: 0, title: 'Queue', sub: 'in process task queue' },
    { id: 'n5', lane: 'b', col: 1, title: 'Worker', sub: 'predict in a threadpool', kind: 'primary' },
    { id: 'n6', lane: 'b', col: 2, title: 'Retry', row: 0 },
    { id: 'n7', lane: 'c', col: 0, title: 'Postgres', kind: 'store' },
    { id: 'n8', lane: 'c', col: 1, title: 'S3', kind: 'store' },
    { id: 'n9', lane: 'c', col: 2, title: 'Janitor', kind: 'external' },
  ],
  edges: [
    { from: 'n1', to: 'n2', label: 'POST /scans' },
    { from: 'n2', to: 'n3', label: '202' },
    { from: 'n2', to: 'n4', label: 'enqueue' },
    { from: 'n4', to: 'n5', label: 'run' },
    { from: 'n5', to: 'n6', label: 'failed', style: 'optional' },
    { from: 'n6', to: 'n5', label: 'retry', style: 'response', fromSide: 'bottom', toSide: 'bottom' },
    { from: 'n5', to: 'n7', label: 'write verdict' },
    { from: 'n5', to: 'n8', label: 'read image', style: 'response' },
    { from: 'n9', to: 'n7', label: 'fail stuck', style: 'optional' },
  ],
  options: { gapX: 64, gapY: 56 },
};

describe('diagram layout (pure geometry, approximate text widths)', () => {
  const builds = [
    ['sample', () => sample({ measure: approxMeasurer })],
    ['stress', () => layoutDiagram(stress, { measure: approxMeasurer })],
  ];
  for (const [name, build] of builds) {
    test(`${name}: no overlaps, arrows touch box edges, labels clear of arrows`, async () => {
      const out = await build();
      assert.deepEqual(validateModel(out.model), []);
      const { boxes, edges } = out.model;
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) assert.equal(rectsIntersect(boxes[i], boxes[j]), false, `${boxes[i].id}/${boxes[j].id}`);
      }
      for (const e of edges) {
        const from = boxes.find((b) => b.id === e.from);
        const to = boxes.find((b) => b.id === e.to);
        assert.ok(onBoundary(e.points[0], from), `${e.id} start`);
        assert.ok(onBoundary(e.points.at(-1), to), `${e.id} end`);
        e.points.slice(1).forEach((p, i) => assert.ok(p.x === e.points[i].x || p.y === e.points[i].y, `${e.id} orthogonal`));
      }
    });
  }

  test('a diagram wider than the page fails loudly instead of shrinking', async () => {
    await assert.rejects(() => sample({ measure: approxMeasurer, maxWidth: 300 }), /wide/);
  });

  test('an edge to a missing node is reported', async () => {
    await assert.rejects(
      () => layoutDiagram({ nodes: [{ id: 'a', title: 'A', col: 0 }], edges: [{ from: 'a', to: 'zzz' }] }, { measure: approxMeasurer }),
      /unknown node/,
    );
  });
});

describe('real fonts and the in-browser layout check', () => {
  let browser;
  let measure;
  before(async () => {
    browser = await launchBrowser();
    const fontPage = await openFontPage(browser, 'test-fonts.html');
    measure = createBrowserMeasurer(fontPage);
  });
  after(async () => { await browser.close(); });

  const printCss = () => fs.readFileSync(path.join(ROOT, 'print.css'), 'utf8');

  async function check(bodyHtml, orientation = 'portrait', mutate = null) {
    const file = path.join(BUILD_DIR, 'test-fixture.html');
    fs.mkdirSync(BUILD_DIR, { recursive: true });
    fs.writeFileSync(file, `<!doctype html><html lang="en"><meta charset="utf-8"><style>${fontCss()}</style><style>${printCss()}</style><body><section class="sheet ${orientation}">${bodyHtml}</section></body></html>`);
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    try {
      await page.goto(pathToFileURL(file).href);
      if (mutate) await page.evaluate(`(${mutate.toString()})(document.querySelector('svg.diagram'))`);
      return (await runLayoutCheck(page)).problems;
    } finally {
      await page.close();
    }
  }

  for (const [name, spec] of [['sample', null], ['stress', stress]]) {
    test(`${name}: measured SVG passes the layout check with zero problems`, async () => {
      const ctx = { measure, maxWidth: 980, maxHeight: 540 };
      const out = spec ? await layoutDiagram(spec, ctx) : await sample(ctx);
      assert.deepEqual(validateModel(out.model), []);
      assert.deepEqual(await check(`<h2>Diagram</h2><figure class="flow-svg">${out.svg}</figure>`, 'landscape'), []);
    });
  }

  const cases = [
    ['overlapping cards', '<div class="card" style="height:30mm">A</div><div class="card" style="margin-top:-10mm">B</div>', /overlap/],
    ['text overflow', '<div style="width:20mm;border:1px solid #000"><span style="display:inline-block;white-space:nowrap">Unbreakable overflowing text</span></div>', /overflow|outside/],
    ['clipped text', '<div style="width:30mm;height:5mm;overflow:hidden"><p>This paragraph has far too much text for the tiny box that holds it so it is clipped.</p></div>', /clipped/],
    ['crossing the page margin', '<div style="width:200mm;height:10mm;background:#ddd">wide</div>', /margins/],
    ['font too small', '<p style="font-size:6pt">tiny text</p>', /font size/],
    ['table font too small', '<table class="table"><tbody><tr><td style="font-size:8pt">x</td></tr></tbody></table>', /font size/],
    ['title over two lines', '<h1 class="section-title" style="font-size:60pt">An extremely long title that cannot possibly fit on two lines at this size at all</h1>', /two lines/],
    ['stranded heading', '<div style="height:975px"></div><h2 style="break-after:auto;margin:0">Stranded</h2><p>Next page text that follows the heading and starts on the following page when the heading sits at the very bottom edge.</p><div style="height:900px"></div>', /stranded/],
  ];
  for (const [name, html, expected] of cases) {
    test(`catches: ${name}`, async () => {
      const problems = await check(html);
      assert.ok(problems.some((p) => expected.test(p.problem)), `expected ${expected}, got ${JSON.stringify(problems)}`);
    });
  }

  const svgBreaks = [
    ['box moved onto another box', (svg) => {
      const b = svg.querySelectorAll('rect.box');
      b[1].setAttribute('x', b[0].getAttribute('x'));
      b[1].setAttribute('y', b[0].getAttribute('y'));
    }, /overlap|crosses a box/],
    ['label moved onto an arrow', (svg) => {
      const l = svg.querySelector('rect.lbl');
      const m = svg.querySelector('path.edge').getAttribute('d').match(/-?\d+(\.\d+)?/g).map(Number);
      l.setAttribute('x', m[0] - 10);
      l.setAttribute('y', m[1] + 2);
    }, /crosses a label|overlaps a box/],
    ['arrow end pulled off the box edge', (svg) => {
      const p = svg.querySelector('path.edge');
      const nums = p.getAttribute('d').match(/-?\d+(\.\d+)?/g);
      const last = nums.length - 1;
      p.setAttribute('d', p.getAttribute('d').replace(new RegExp(`${nums[last]}\\s*$`), String(Number(nums[last]) + 7)));
    }, /does not touch|diagonal/],
  ];
  for (const [name, mutate, expected] of svgBreaks) {
    test(`catches (diagram): ${name}`, async () => {
      const out = await sample({ measure, maxWidth: 980, maxHeight: 540 });
      const problems = await check(`<figure class="flow-svg">${out.svg}</figure>`, 'landscape', mutate);
      assert.ok(problems.some((p) => expected.test(p.problem)), `expected ${expected}, got ${JSON.stringify(problems.map((p) => p.problem))}`);
    });
  }
});
