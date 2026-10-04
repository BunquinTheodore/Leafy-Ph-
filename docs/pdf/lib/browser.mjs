// Browser helpers: launch the Chromium that Playwright already downloaded (default
// %LOCALAPPDATA%\ms-playwright, nothing is fetched here) and prepare pages that have the
// local fonts, so measurement and rendering use the exact fonts that end up in the PDF.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BUILD_DIR = path.join(ROOT, 'build');

export const fontsUrl = () => pathToFileURL(path.join(ROOT, 'node_modules', '@fontsource')).href;

/** fonts.css with the __FONTS__ placeholder resolved to a file URL. */
export function fontCss() {
  return fs.readFileSync(path.join(ROOT, 'fonts.css'), 'utf8').replaceAll('__FONTS__', fontsUrl());
}

export async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    throw new Error(
      `Could not start Chromium (${error.message.split('\n')[0]}). `
      + 'Run "pnpm exec playwright install chromium" once, or point PLAYWRIGHT_BROWSERS_PATH at the folder that already has it.',
    );
  }
}

/** Opens a blank page (served from file:// so the font files load) with the fonts ready. */
export async function openFontPage(browser, name = 'fonts-page.html') {
  fs.mkdirSync(BUILD_DIR, { recursive: true });
  const file = path.join(BUILD_DIR, name);
  fs.writeFileSync(file, `<!doctype html><meta charset="utf-8"><style>${fontCss()}</style><body>fonts</body>`);
  const page = await browser.newPage();
  await page.goto(pathToFileURL(file).href);
  return page;
}
