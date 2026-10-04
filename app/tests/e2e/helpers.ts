import type { Page } from "@playwright/test";

export const VIEWPORTS = [
  { name: "360", width: 360, height: 800 },
  { name: "768", width: 768, height: 1024 },
  { name: "1440", width: 1440, height: 900 },
] as const;

export const MAX_DOCUMENT_RATIO = 1.15;

/** Number of rendered text lines of the first element matching `selector`. */
export async function lineCount(page: Page, selector: string): Promise<number> {
  return page.evaluate((target) => {
    const element = document.querySelector(target);
    if (!element) return 0;
    const range = document.createRange();
    range.selectNodeContents(element);
    return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top / 4))).size;
  }, selector);
}

/** Lines of every visible h1 and h2 on the page (hidden panels are skipped). */
export async function headingLines(page: Page): Promise<Array<{ text: string; lines: number }>> {
  return page.evaluate(() =>
    [...document.querySelectorAll("h1, h2")]
      .filter((element) => {
        const box = element.getBoundingClientRect();
        const panel = element.closest(".panels__panel");
        return box.width > 0 && (!panel || panel.getAttribute("data-active") === "true");
      })
      .map((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const lines = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top / 4)))
          .size;
        return { text: element.textContent?.trim() ?? "", lines };
      }),
  );
}

export async function documentRatio(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollHeight / window.innerHeight);
}

/** Pixels by which the active panel's content is taller than the panel (0 means it fits). */
export async function activePanelOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const panel = document.querySelector('.panels__panel[data-active="true"]');
    return panel ? Math.max(0, panel.scrollHeight - panel.clientHeight) : 0;
  });
}

export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
  );
}

/** Panel ids once hydration has settled (phones and desktops chunk lists differently). */
export async function stablePanelIds(page: Page): Promise<string[]> {
  await page.waitForLoadState("networkidle");
  let previous = "";
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const joined = (
      await page.evaluate(() =>
        [...document.querySelectorAll(".panels__panel")].map((node) => node.id),
      )
    ).join("|");
    if (joined && joined === previous) return joined.split("|");
    previous = joined;
    await page.waitForTimeout(250);
  }
  throw new Error("panels never settled");
}

/** Moves keyboard focus inside the carousel so arrow keys reach it. */
export async function focusCarousel(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Next panel" }).focus();
}

export async function goToPanel(page: Page, id: string): Promise<void> {
  await page.evaluate((hash) => {
    window.location.hash = hash;
  }, id);
  await page.waitForFunction(
    (target) =>
      document.querySelector(`#${CSS.escape(target)}`)?.getAttribute("data-active") === "true",
    id,
  );
  await page.waitForTimeout(450);
}

/** Visible text elements whose computed hyphenation is not off. */
export async function hyphenationOffenders(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      [...document.querySelectorAll("body *")].filter(
        (element) => getComputedStyle(element).hyphens !== "none" && element.childNodes.length > 0,
      ).length,
  );
}
