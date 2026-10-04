// Text measurement for the diagram helper.
// A measurer is `async (requests) => results` where a request is `{ text, font }`
// (font is a CSS font shorthand such as "600 12px Poppins") and a result is
// `{ w, asc, desc }` in CSS pixels (advance width, font ascent, font descent).

/** Real measurement in Chromium (canvas measureText) on a page that already has the fonts available. */
export function createBrowserMeasurer(page) {
  const cache = new Map();
  return async function measure(requests) {
    const missing = [];
    for (const r of requests) {
      const key = `${r.font}|${r.text}`;
      if (!cache.has(key)) missing.push(r);
    }
    if (missing.length > 0) {
      const unique = [...new Map(missing.map((r) => [`${r.font}|${r.text}`, r])).values()];
      const results = await page.evaluate(async (reqs) => {
        const fonts = [...new Set(reqs.map((r) => r.font))];
        await Promise.all(fonts.map((f) => document.fonts.load(f, 'Aa')));
        await document.fonts.ready;
        const ctx = document.createElement('canvas').getContext('2d');
        return reqs.map((r) => {
          ctx.font = r.font;
          const m = ctx.measureText(r.text);
          return { w: m.width, asc: m.fontBoundingBoxAscent, desc: m.fontBoundingBoxDescent };
        });
      }, unique);
      unique.forEach((r, i) => cache.set(`${r.font}|${r.text}`, results[i]));
    }
    return requests.map((r) => cache.get(`${r.font}|${r.text}`));
  };
}

/** Deterministic stand in used only by pure unit tests (no browser). */
export async function approxMeasurer(requests) {
  return requests.map((r) => {
    const size = Number(/(\d+(?:\.\d+)?)px/.exec(r.font)?.[1] ?? 12);
    return { w: r.text.length * size * 0.58, asc: size * 1.05, desc: size * 0.35 };
  });
}
