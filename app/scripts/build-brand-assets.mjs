// Generates the Leafy brand assets (SVG marks, wordmark, lockups, favicons, PWA icons, OG image,
// cursors, manifest) from src/components/brand/mark.json and Josefin Sans Light.
// Run: node scripts/build-brand-assets.mjs   (needs network once to cache the font)
import { chromium } from "@playwright/test";
import opentype from "opentype.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");
const fontCache = resolve(root, "..", ".dev", "fonts");
const mark = JSON.parse(readFileSync(join(root, "src/components/brand/mark.json"), "utf8"));

const FONT_URL =
  "https://fonts.gstatic.com/s/josefinsans/v34/Qw3PZQNVED7rKGKxtqIqX5E-AVSJrOCfjY46_GbQXME.ttf";
const TRACKING_EM = 0.18;

const palette = {
  bgDark: "#06120b",
  surfaceDark: "#10281a",
  textDark: "#e9f4ec",
  mutedDark: "#9bb8a6",
  textLight: "#0e2316",
  brand: "#40c057",
  glow: "#7be495",
  deep: "#1f6b3a",
  lightBrand: "#23813a",
  lightDeep: "#17542d",
};

const variants = {
  "on-dark": { big: palette.brand, small: palette.glow, word: palette.textDark },
  "on-light": { big: palette.lightDeep, small: palette.lightBrand, word: palette.textLight },
  "mono-black": { big: "#000000", small: "#000000", word: "#000000" },
  "mono-white": { big: "#ffffff", small: "#ffffff", word: "#ffffff" },
};

const write = (rel, content) => {
  const file = join(pub, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
};

async function loadFont() {
  mkdirSync(fontCache, { recursive: true });
  const file = join(fontCache, "JosefinSans-Light.ttf");
  if (!existsSync(file)) {
    const response = await fetch(FONT_URL);
    if (!response.ok) throw new Error(`Font download failed: ${response.status}`);
    writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  }
  const buffer = readFileSync(file);
  return opentype.parse(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  );
}

/** Lays glyphs out by hand (advance + tracking + kerning); getPath with letterSpacing yields NaN here. */
function layoutPath(font, text, fontSize, trackingEm) {
  const scale = fontSize / font.unitsPerEm;
  const glyphs = font.stringToGlyphs(text);
  const commands = [];
  let x = 0;
  glyphs.forEach((glyph, index) => {
    commands.push(...glyph.getPath(x, 0, fontSize).commands);
    x += glyph.advanceWidth * scale + trackingEm * fontSize;
    const next = glyphs[index + 1];
    if (next) x += font.getKerningValue(glyph, next) * scale;
  });
  const path = new opentype.Path();
  path.commands = commands;
  return path;
}

const mapCommand = (c, f) => {
  const out = { ...c };
  for (const [kx, ky] of [
    ["x", "y"],
    ["x1", "y1"],
    ["x2", "y2"],
  ]) {
    if (kx in c) [out[kx], out[ky]] = f(c[kx], c[ky]);
  }
  return out;
};

const round = (value) => String(Math.round(value * 100) / 100);

/** Own serializer: opentype's toPathData emitted NaN for some quadratic segments. */
function commandsToPathData(commands) {
  return commands
    .map((c) => {
      if (c.type === "Z") return "Z";
      if (c.type === "Q") return `Q${round(c.x1)} ${round(c.y1)} ${round(c.x)} ${round(c.y)}`;
      if (c.type === "C")
        return `C${round(c.x1)} ${round(c.y1)} ${round(c.x2)} ${round(c.y2)} ${round(c.x)} ${round(c.y)}`;
      return `${c.type}${round(c.x)} ${round(c.y)}`;
    })
    .join("");
}

/** Outlined text normalised so the cap height is 100 units and the top left is the origin. */
function outlineText(font, text, trackingEm = TRACKING_EM) {
  const probe = layoutPath(font, text, 100, trackingEm);
  const box = probe.getBoundingBox();
  const scale = 100 / (box.y2 - box.y1);
  const path = new opentype.Path();
  path.commands = probe.commands.map((c) =>
    mapCommand(c, (x, y) => [(x - box.x1) * scale, (y - box.y1) * scale]),
  );
  const b = path.getBoundingBox();
  const d = commandsToPathData(path.commands);
  if (d.includes("NaN")) throw new Error("NaN in outlined text");
  return { d, width: Math.round(b.x2 * 100) / 100, height: 100 };
}

const markGroup = (fills, extra = "") =>
  `<g${extra}><path fill="${fills.big}" d="${mark.big}"/><path fill="${fills.small}" d="${mark.small}"/></g>`;

const svgDoc = (width, height, body, title) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${title}"><title>${title}</title>${body}</svg>\n`;

function wordmarkSvg(word, fill) {
  return svgDoc(word.width, word.height, `<path fill="${fill}" d="${word.d}"/>`, "Leafy");
}

function horizontalLockup(word, fills) {
  const capHeight = 46;
  const scale = capHeight / word.height;
  const gap = 30;
  const wordWidth = word.width * scale;
  const width = mark.width + gap + wordWidth;
  const y = (mark.height - capHeight) / 2;
  const body = `${markGroup(fills)}<path fill="${fills.word}" transform="translate(${mark.width + gap} ${y}) scale(${scale})" d="${word.d}"/>`;
  return {
    svg: svgDoc(Math.round(width), mark.height, body, "Leafy"),
    width: Math.round(width),
    height: mark.height,
    capHeight,
    gap,
  };
}

function stackedLockup(word, fills) {
  const capHeight = 30;
  const scale = capHeight / word.height;
  const gap = 28;
  const wordWidth = word.width * scale;
  const width = Math.max(mark.width, wordWidth);
  const height = mark.height + gap + capHeight;
  const body = `<g transform="translate(${(width - mark.width) / 2} 0)">${markGroup(fills)}</g><path fill="${fills.word}" transform="translate(${(width - wordWidth) / 2} ${mark.height + gap}) scale(${scale})" d="${word.d}"/>`;
  return svgDoc(Math.round(width), Math.round(height), body, "Leafy");
}

function faviconSvg() {
  const css = `.b{fill:${palette.lightDeep}}.s{fill:${palette.lightBrand}}@media (prefers-color-scheme:dark){.b{fill:${palette.brand}}.s{fill:${palette.glow}}}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 140" width="120" height="140"><style>${css}</style><path class="b" d="${mark.big}"/><path class="s" d="${mark.small}"/></svg>\n`;
}

/** Square icon: dark forest background, mark centered inside a safe zone fraction of the canvas. */
function iconSvg(size, markHeightRatio, rounded) {
  const markH = size * markHeightRatio;
  const scale = markH / mark.height;
  const x = (size - mark.width * scale) / 2;
  const y = (size - markH) / 2;
  const radius = rounded ? size * 0.22 : 0;
  const body = `<defs><radialGradient id="g" cx="50%" cy="38%" r="70%"><stop offset="0" stop-color="${palette.surfaceDark}"/><stop offset="1" stop-color="${palette.bgDark}"/></radialGradient></defs><rect width="${size}" height="${size}" rx="${radius}" fill="url(#g)"/><g transform="translate(${x} ${y}) scale(${scale})">${markGroup(variants["on-dark"])}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${body}</svg>`;
}

function ogSvg(word, tagline) {
  const w = 1200;
  const h = 630;
  const markH = 250;
  const ms = markH / mark.height;
  const wordCap = 62;
  const ws = wordCap / word.height;
  const wordW = word.width * ws;
  const gap = 56;
  const total = mark.width * ms + gap + wordW;
  const x0 = (w - total) / 2;
  const my = 118;
  const tagCap = 30;
  const ts = tagCap / tagline.height;
  const tagW = tagline.width * ts;
  const body = `<defs><radialGradient id="bg" cx="50%" cy="40%" r="80%"><stop offset="0" stop-color="#14341f"/><stop offset="0.6" stop-color="${palette.surfaceDark}"/><stop offset="1" stop-color="${palette.bgDark}"/></radialGradient></defs>
<rect width="${w}" height="${h}" fill="url(#bg)"/>
<g transform="translate(${x0} ${my}) scale(${ms})">${markGroup(variants["on-dark"])}</g>
<path fill="${palette.textDark}" transform="translate(${x0 + mark.width * ms + gap} ${my + (markH - wordCap) / 2}) scale(${ws})" d="${word.d}"/>
<path fill="${palette.mutedDark}" transform="translate(${(w - tagW) / 2} ${my + markH + 78}) scale(${ts})" d="${tagline.d}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`;
}

function icoFromPngs(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = 6 + entries.length * 16;
  const dirs = [];
  for (const { size, data } of entries) {
    const dir = Buffer.alloc(16);
    dir.writeUInt8(size >= 256 ? 0 : size, 0);
    dir.writeUInt8(size >= 256 ? 0 : size, 1);
    dir.writeUInt16LE(1, 4);
    dir.writeUInt16LE(32, 6);
    dir.writeUInt32LE(data.length, 8);
    dir.writeUInt32LE(offset, 12);
    offset += data.length;
    dirs.push(dir);
  }
  return Buffer.concat([header, ...dirs, ...entries.map((e) => e.data)]);
}

// ---- cursors ---------------------------------------------------------------------------------
function cursorParts() {
  const source = readFileSync(join(root, "scripts/assets/icons8-cursor.svg"), "utf8");
  const d = /<path d="([^"]+)"/.exec(source)?.[1];
  if (!d) throw new Error("cursor path not found");
  const subpaths = d
    .split(/(?=M )/)
    .map((s) => s.trim())
    .filter(Boolean);
  // Subpath 4 is the arrow silhouette, 5 its inner hole, per the icons8 source.
  const silhouette = subpaths.find((s) => s.startsWith("M 19.248047 9.914062"));
  if (!silhouette) throw new Error("arrow silhouette subpath not found");
  return { d, silhouette };
}

function cursorSvgs() {
  const { d, silhouette } = cursorParts();
  const open =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60" width="32" height="32">';
  const halo = `<path d="${d}" fill="#ffffff" stroke="#ffffff" stroke-width="3" stroke-linejoin="round" opacity="0.92"/>`;
  const arrow = `<path d="${d}" fill="${palette.brand}"/>`;
  const fill = `<path d="${silhouette}" fill="${palette.brand}" opacity="0.38"/>`;
  const bold = `<path d="${d}" fill="${palette.brand}" stroke="${palette.brand}" stroke-width="1.4" stroke-linejoin="round"/>`;
  const ring = (stroke, width) =>
    `<circle cx="14" cy="47" r="7" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-dasharray="26 18" stroke-linecap="round"/>`;
  return {
    "leaf-cursor.svg": `${open}${halo}${arrow}</svg>\n`,
    "leaf-cursor-pointer.svg": `${open}${halo}${fill}${bold}</svg>\n`,
    "leaf-cursor-busy.svg": `${open}${halo}${ring("#ffffff", 6)}${arrow}${ring(palette.brand, 3)}</svg>\n`,
  };
}

// ---- rasterising -----------------------------------------------------------------------------
async function rasterise(browser, svg, width, height, transparent) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${width}px;height:${height}px}</style>${svg}`,
  );
  const buffer = await page.screenshot({
    omitBackground: transparent,
    clip: { x: 0, y: 0, width, height },
  });
  await page.close();
  return buffer;
}

async function main() {
  const font = await loadFont();
  const word = outlineText(font, "LEAFY");
  const tagline = outlineText(font, "KNOW YOUR LEAF.", 0.14);

  writeFileSync(
    join(root, "src/components/brand/wordmark.json"),
    `${JSON.stringify({ width: word.width, height: word.height, d: word.d }, null, 2)}\n`,
  );

  for (const [name, fills] of Object.entries(variants)) {
    write(
      `brand/leafy-mark-${name}.svg`,
      svgDoc(mark.width, mark.height, markGroup(fills), "Leafy mark"),
    );
    write(`brand/leafy-wordmark-${name}.svg`, wordmarkSvg(word, fills.word));
    write(`brand/leafy-lockup-horizontal-${name}.svg`, horizontalLockup(word, fills).svg);
    write(`brand/leafy-lockup-stacked-${name}.svg`, stackedLockup(word, fills));
  }
  write(
    "brand/leafy-mark-two-tone.svg",
    svgDoc(
      mark.width,
      mark.height,
      markGroup({ big: palette.deep, small: palette.brand }),
      "Leafy mark",
    ),
  );
  write("icons/favicon.svg", faviconSvg());
  write(
    "icons/safari-pinned-tab.svg",
    svgDoc(mark.width, mark.height, `<path fill="#000" d="${mark.big} ${mark.small}"/>`, "Leafy"),
  );

  for (const [file, svg] of Object.entries(cursorSvgs())) write(`cursors/${file}`, svg);

  const browser = await chromium.launch();
  try {
    const small = {};
    for (const size of [16, 32, 48]) {
      // Tiny sizes use a single brand green for contrast, with the mark filling the canvas height.
      const scale = size / mark.height;
      const x = (size - mark.width * scale) / 2;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><g transform="translate(${x} 0) scale(${scale})"><path fill="${palette.brand}" d="${mark.big}"/><path fill="${palette.glow}" d="${mark.small}"/></g></svg>`;
      small[size] = await rasterise(browser, svg, size, size, true);
      write(`icons/favicon-${size}.png`, small[size]);
    }
    write("favicon.ico", icoFromPngs([16, 32, 48].map((size) => ({ size, data: small[size] }))));
    write(
      "icons/apple-touch-icon.png",
      await rasterise(browser, iconSvg(180, 0.6, false), 180, 180, false),
    );
    for (const size of [192, 512]) {
      write(
        `icons/icon-${size}.png`,
        await rasterise(browser, iconSvg(size, 0.62, true), size, size, true),
      );
      // Maskable: full bleed background, mark inside the 80% safe circle (height ratio 0.5).
      write(
        `icons/icon-maskable-${size}.png`,
        await rasterise(browser, iconSvg(size, 0.5, false), size, size, false),
      );
    }
    write("og/og-image.png", await rasterise(browser, ogSvg(word, tagline), 1200, 630, false));
  } finally {
    await browser.close();
  }

  write(
    "manifest.webmanifest",
    `${JSON.stringify(
      {
        name: "Leafy",
        short_name: "Leafy",
        description: "Snap a leaf, understand the disease, know what to do next.",
        start_url: "/?source=pwa",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: palette.bgDark,
        theme_color: palette.bgDark,
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          {
            src: "/icons/icon-maskable-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "/icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
        shortcuts: [
          {
            name: "Scan a leaf",
            url: "/scan",
            icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
          },
          {
            name: "Handbook",
            url: "/handbook",
            icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  console.log("brand assets written to", pub);
}

await main();
