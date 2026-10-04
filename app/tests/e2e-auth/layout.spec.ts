import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { axePath, lineCount, mintToken, setTheme } from "./support/helpers";

// axe-core is injected as a script, which the strict nonce CSP rightly blocks.
test.use({ bypassCSP: true });

const SCREENS_DIR = path.resolve(__dirname, "../../../docs/screens/auth-extras");
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
] as const;
const THEMES = ["dark", "light"] as const;
const MAX_HEIGHT_RATIO = 1.15;

interface Route {
  name: string;
  url: (token: { reset: string; verify: string }) => string;
}

const ROUTES: Route[] = [
  { name: "login", url: () => "/login" },
  { name: "login-session-expired", url: () => "/login?reason=session_expired&next=%2Fscan" },
  { name: "register", url: () => "/register" },
  { name: "forgot-password", url: () => "/forgot-password" },
  { name: "reset-password", url: ({ reset }) => `/reset-password?token=${reset}` },
  { name: "reset-password-expired", url: () => "/reset-password" },
  { name: "verify-email-expired", url: () => "/verify-email" },
  { name: "about", url: () => "/about" },
  { name: "privacy", url: () => "/privacy" },
  { name: "terms", url: () => "/terms" },
  { name: "not-found", url: () => "/this-page-does-not-exist" },
];

async function overlaps(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const selector =
      "main a, main button, main input, main select, main textarea, header a, header button";
    const boxes = [...document.querySelectorAll<HTMLElement>(selector)]
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          rect.width > 0 &&
          rect.height > 0 &&
          !element.closest("[inert]")
        );
      })
      .map((element) => ({
        label: `${element.tagName.toLowerCase()} ${(element.textContent ?? element.getAttribute("aria-label") ?? "").trim().slice(0, 24)}`,
        rect: element.getBoundingClientRect(),
        parent: element.parentElement,
        element,
      }));
    const found: string[] = [];
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        if (a.element.contains(b.element) || b.element.contains(a.element)) continue;
        // The show password button sits inside its own input by design.
        if (a.parent === b.parent && a.parent?.classList.contains("field")) continue;
        const x = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
        const y = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
        if (x > 2 && y > 2) found.push(`${a.label} overlaps ${b.label}`);
      }
    }
    return found;
  });
}

test.describe("layout rules, screenshots and accessibility", () => {
  test.beforeAll(() => mkdirSync(SCREENS_DIR, { recursive: true }));

  for (const viewport of VIEWPORTS) {
    for (const theme of THEMES) {
      test(`${viewport.name} ${theme}`, async ({ page, request }) => {
        test.setTimeout(180_000);
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        const tokens = {
          reset: await mintToken(request, "reset"),
          verify: await mintToken(request, "verify", "expired"),
        };
        await page.emulateMedia({
          colorScheme: theme,
          reducedMotion: "no-preference",
        });

        for (const route of ROUTES) {
          const url = route.url(tokens);
          await page.goto(`${url}${url.includes("?") ? "&" : "?"}nosplash`);
          await setTheme(page, theme);
          await page.waitForTimeout(900);
          const label = `${route.name} ${viewport.name} ${theme}`;

          // One h1, at most two lines.
          await expect(page.locator("h1"), `${label} h1 count`).toHaveCount(1);
          expect(await lineCount(page, "h1"), `${label} h1 lines`).toBeLessThanOrEqual(2);
          expect(await lineCount(page, "h2"), `${label} first h2 lines`).toBeLessThanOrEqual(2);

          // The page fits the stage: no long vertical scrolling, no sideways page scroll.
          const metrics = await page.evaluate(() => ({
            height: document.documentElement.scrollHeight,
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
            hyphenated: [...document.querySelectorAll("body *")].filter(
              (element) =>
                getComputedStyle(element).hyphens !== "none" && element.childNodes.length > 0,
            ).length,
          }));
          expect(metrics.height / viewport.height, `${label} document height`).toBeLessThanOrEqual(
            MAX_HEIGHT_RATIO,
          );
          expect(metrics.scrollWidth, `${label} horizontal scroll`).toBeLessThanOrEqual(
            metrics.clientWidth,
          );
          expect(metrics.hyphenated, `${label} hyphenation`).toBe(0);

          // Nothing interactive sits on top of anything else.
          expect(await overlaps(page), `${label} overlaps`).toEqual([]);

          // Touch targets stay at least 44px tall.
          const small = await page.evaluate(() =>
            [...document.querySelectorAll<HTMLElement>("main a, main button, .site-footer a")]
              .filter((element) => !element.closest("[inert]"))
              .filter((element) => {
                const rect = element.getBoundingClientRect();
                const style = getComputedStyle(element);
                return (
                  rect.width > 0 &&
                  style.display !== "none" &&
                  style.visibility !== "hidden" &&
                  rect.height < 43.5 &&
                  !element.closest(".auth-legal, .prose")
                );
              })
              .map(
                (element) =>
                  `${element.textContent?.trim().slice(0, 20)} ${Math.round(element.getBoundingClientRect().height)}`,
              ),
          );
          expect(small, `${label} small targets`).toEqual([]);

          // WCAG AA contrast and the rest of axe.
          await page.addScriptTag({ content: readFileSync(axePath(), "utf8") });
          const violations = await page.evaluate(async () => {
            const axe = (
              window as unknown as {
                axe: {
                  run: (
                    c: unknown,
                    o: unknown,
                  ) => Promise<{
                    violations: Array<{
                      id: string;
                      nodes: Array<{ target: string[]; html: string; failureSummary?: string }>;
                    }>;
                  }>;
                };
              }
            ).axe;
            const result = await axe.run(document, {
              runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] },
            });
            return result.violations.map(
              (violation) =>
                `${violation.id}: ${violation.nodes
                  .map(
                    (n) => `${n.target.join(" ")} ${n.html.slice(0, 90)} ${n.failureSummary ?? ""}`,
                  )
                  .slice(0, 3)
                  .join(" | ")}`,
            );
          });
          expect(violations, `${label} axe`).toEqual([]);

          await page.screenshot({
            path: path.join(SCREENS_DIR, `${route.name}-${viewport.name}-${theme}.png`),
          });
        }
      });
    }
  }
});
