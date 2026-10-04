// Section 5: the scan progress stepper as a static storyboard. Six frames side by side, never layered.
// Plain inline SVG built on a fixed grid. Text is measured with the real fonts and the build throws if any line
// would not fit its frame, so nothing can clip or overlap.

const W = 936;
const FRAMES = 6;
const GAP = 12;
const FW = (W - GAP * (FRAMES - 1)) / FRAMES;
const PAD = 10;
const INNER = FW - 2 * PAD;
const COLORS = {
  ink: '#0e2316', soft: '#46604f', brand: '#23813a', deep: '#17542d', tint: '#e4f3e5',
  rule: '#cfe0cb', paper: '#ffffff', grey: '#5b7566', pendingInk: '#34493b', amber: '#a86a00', amberTint: '#fbf6ea',
};
const F = {
  title: { family: 'Poppins', weight: 600, size: 13.5 },
  step: { family: 'Poppins', weight: 500, size: 12.5 },
  stepNow: { family: 'Poppins', weight: 600, size: 12.5 },
  meta: { family: 'Poppins', weight: 500, size: 12.5 },
  copy: { family: 'Manrope', weight: 500, size: 13 },
  badge: { family: 'Poppins', weight: 600, size: 12 },
};
const font = (f) => `${f.weight} ${f.size}px ${f.family}`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const STEPS = ['Uploading', 'Checking image', 'Analyzing leaf', 'Saving result', 'Done'];
const FRAME_DATA = [
  { title: 'Uploading', current: 0, bar: 0.19, elapsed: '0:02', screen: 'Uploading 62%. Cancel is shown.', note: 'A true percentage from the upload itself.' },
  { title: 'Checking image', current: 1, bar: 0.34, elapsed: '0:03', screen: 'Checking image', note: 'Server stage: validating.' },
  { title: 'Analyzing leaf', current: 2, bar: 0.62, elapsed: '0:06', screen: 'Analyzing leaf. The scanning beam runs.', note: 'Server stage: analyzing. The bar is eased and slows toward 90%.' },
  { title: 'Still analyzing', current: 2, bar: 0.86, elapsed: '0:09', screen: 'Still analyzing, larger photos take a bit longer.', note: 'After about 8 s this reassurance appears. After the timeout: a clear failure with Retry.' },
  { title: 'Saving result', current: 3, bar: 0.95, elapsed: '0:11', screen: 'Saving result', note: 'Server stage: saving. Still below 100%.' },
  { title: 'Done', current: 5, bar: 1, elapsed: '0:12', screen: 'Done. Opening your result.', note: 'The result arrived. Only now does the bar reach 100%.' },
];

async function wrap(measure, text, f, limit, balance = false) {
  const first = await wrapAt(measure, text, f, limit);
  if (!balance || first.length < 2) return first;
  // Narrowest width that keeps the same line count, so no line is left with a lone word.
  let lo = limit * 0.55;
  let best = first;
  let hi = limit;
  for (let i = 0; i < 8; i += 1) {
    const mid = (lo + hi) / 2;
    let trial;
    try { trial = await wrapAt(measure, text, f, mid); } catch { trial = null; }
    if (trial && trial.length === first.length) { best = trial; hi = mid; } else { lo = mid; }
  }
  return best;
}

async function wrapAt(measure, text, f, limit) {
  const words = text.split(/\s+/);
  const widths = await measure([...words.map((w) => ({ text: w, font: font(f) })), { text: ' ', font: font(f) }]);
  const space = widths[words.length].w;
  const lines = [];
  let cur = '';
  let curW = 0;
  words.forEach((w, i) => {
    const ww = widths[i].w;
    if (cur && curW + space + ww > limit) { lines.push(cur); cur = w; curW = ww; } else { cur = cur ? `${cur} ${w}` : w; curW = cur === w ? ww : curW + space + ww; }
  });
  if (cur) lines.push(cur);
  const exact = await measure(lines.map((t) => ({ text: t, font: font(f) })));
  exact.forEach((m, i) => { if (m.w > limit + 0.5) throw new Error(`stepper: "${lines[i]}" is ${m.w.toFixed(0)}px, limit ${limit}`); });
  return lines;
}

const tx = (x, y, str, f, fill, extra = '') => `<text x="${x}" y="${y}" font-family="${f.family}" font-weight="${f.weight}" font-size="${f.size}" fill="${fill}" ${extra}>${esc(str)}</text>`;

function stepDot(cx, cy, state) {
  if (state === 'done') {
    return `<circle cx="${cx}" cy="${cy}" r="7" fill="${COLORS.brand}"/><path d="M${cx - 3.2} ${cy} L${cx - 0.8} ${cy + 2.6} L${cx + 3.4} ${cy - 2.6}" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  if (state === 'current') {
    return `<circle cx="${cx}" cy="${cy}" r="7" fill="${COLORS.paper}" stroke="${COLORS.brand}" stroke-width="2.4"/><circle cx="${cx}" cy="${cy}" r="3" fill="${COLORS.brand}"/>`;
  }
  return `<circle cx="${cx}" cy="${cy}" r="6.5" fill="${COLORS.paper}" stroke="${COLORS.grey}" stroke-width="1.8"/>`;
}

export default async function scanStepper(ctx) {
  const m = ctx.measure;
  const metrics = (await m([{ text: 'Hg', font: font(F.copy) }]))[0];
  const copyLh = Math.ceil(metrics.fontBoundingBoxAscent ?? (metrics.asc + metrics.desc)) + 3;
  const screenLines = await Promise.all(FRAME_DATA.map((d) => wrap(m, d.screen, F.copy, INNER - 16, true)));
  const noteLines = await Promise.all(FRAME_DATA.map((d) => wrap(m, d.note, F.copy, INNER)));
  const titleLines = await Promise.all(FRAME_DATA.map((d) => wrap(m, d.title, F.title, INNER)));
  await Promise.all(STEPS.flatMap((s) => [wrap(m, s, F.step, INNER - 24), wrap(m, s, F.stepNow, INNER - 24)]));
  await wrap(m, 'Step 5 of 5', F.meta, INNER / 2);

  const y = {};
  y.badge = PAD;
  y.title = y.badge + 30;
  y.steps = y.title + 30;
  const pitch = 30;
  y.meta = y.steps + STEPS.length * pitch + 6;
  y.bar = y.meta + 10;
  y.screen = y.bar + 8 + 14;
  // Each message box fits its own text and the note follows it, so no box has empty space inside.
  const screenH = screenLines.map((l) => l.length * copyLh + 16);
  const noteY = screenH.map((h) => y.screen + h + 10);
  const FH = Math.ceil(Math.max(...noteY.map((ny, i) => ny + noteLines[i].length * copyLh)) + PAD);
  const H = FH + 2;

  const parts = [];
  parts.push(`<svg class="storyboard-svg" xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Progress stepper storyboard in six frames. Frame 1 Uploading with a real percentage. Frame 2 Checking image. Frame 3 Analyzing leaf with an eased bar. Frame 4 Still analyzing, with reassurance copy after about eight seconds. Frame 5 Saving result. Frame 6 Done, the only moment the bar reaches one hundred percent."><title>Progress stepper in six frames</title>`);
  FRAME_DATA.forEach((d, i) => {
    const x0 = i * (FW + GAP);
    parts.push(`<g class="frame">`);
    parts.push(`<rect x="${x0 + 0.5}" y="1" width="${FW - 1}" height="${FH - 1}" rx="10" fill="${COLORS.paper}" stroke="${COLORS.rule}" stroke-width="1"/>`);
    // badge
    parts.push(`<circle cx="${x0 + PAD + 10}" cy="${y.badge + 10 + 1}" r="10" fill="${COLORS.brand}"/>`);
    parts.push(tx(x0 + PAD + 10, y.badge + 15, String(i + 1), F.badge, '#ffffff', 'text-anchor="middle"'));
    titleLines[i].forEach((line, k) => parts.push(tx(x0 + PAD, y.title + 12 + k * 17, line, F.title, COLORS.deep)));
    // steps
    STEPS.forEach((s, k) => {
      const cy = y.steps + k * pitch + 9;
      const cx = x0 + PAD + 8;
      const state = k < d.current ? 'done' : k === d.current ? 'current' : 'pending';
      if (k < STEPS.length - 1) {
        const doneLine = k < d.current;
        parts.push(`<line x1="${cx}" y1="${cy + 8}" x2="${cx}" y2="${cy + pitch - 8}" stroke="${doneLine ? COLORS.brand : COLORS.grey}" stroke-width="${doneLine ? 2 : 1.6}"${doneLine ? '' : ' stroke-dasharray="2 3" stroke-linecap="round"'}/>`);
      }
      parts.push(stepDot(cx, cy, state));
      const label = state === 'current' ? F.stepNow : F.step;
      parts.push(tx(x0 + PAD + 24, cy + 4.5, s, label, state === 'pending' ? COLORS.pendingInk : COLORS.ink));
    });
    // meta line and bar
    parts.push(tx(x0 + PAD, y.meta + 4, `Step ${Math.min(d.current + 1, 5)} of 5`, F.meta, COLORS.soft));
    parts.push(tx(x0 + FW - PAD, y.meta + 4, d.elapsed, F.meta, COLORS.soft, 'text-anchor="end"'));
    parts.push(`<rect x="${x0 + PAD}" y="${y.bar}" width="${INNER}" height="8" rx="4" fill="${COLORS.tint}" stroke="${COLORS.rule}" stroke-width="0.8"/>`);
    parts.push(`<rect x="${x0 + PAD}" y="${y.bar}" width="${Math.round(INNER * d.bar)}" height="8" rx="4" fill="${COLORS.brand}"/>`);
    // screen text
    const reassure = i === 3;
    parts.push(`<rect x="${x0 + PAD}" y="${y.screen}" width="${INNER}" height="${screenH[i]}" rx="6" fill="${reassure ? COLORS.amberTint : COLORS.tint}" stroke="${reassure ? COLORS.amber : COLORS.rule}" stroke-width="${reassure ? 1.2 : 0.8}"/>`);
    screenLines[i].forEach((line, k) => parts.push(tx(x0 + PAD + 8, y.screen + 8 + 10 + k * copyLh, line, F.copy, COLORS.ink)));
    // note
    noteLines[i].forEach((line, k) => parts.push(tx(x0 + PAD, noteY[i] + 11 + k * copyLh, line, F.copy, COLORS.ink)));
    parts.push('</g>');
  });
  parts.push('</svg>');
  return parts.join('');
}
