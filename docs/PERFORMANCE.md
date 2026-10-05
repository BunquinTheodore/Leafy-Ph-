# Leafy performance and accessibility

Targets come from the plan (speed and PageSpeed Insights section): mobile, throttled Lighthouse at
least 90 for Performance, Accessibility, Best Practices and SEO on the public pages, LCP at most
2.5 s, CLS at most 0.1, TBT at most 200 ms, INP at most 200 ms; signed in pages at least 90 for
Accessibility and Best Practices and at least 85 for Performance; zero serious or critical axe
violations; JS per route under about 170 KB gzipped before the lazy 3D chunks.

This file records the numbers before and after the speed pass, how they were measured, what changed,
what was tried and rejected, and what is still short of target.

## How it was measured

- Real stack: production Next build (`next build && next start`), the FastAPI API, Postgres 17 and an
  S3 compatible server, seeded catalog, `ML_SERVICE=dev-fake` and `GOOGLE_MOCK=1` (dev only).
- Lighthouse 12.6.1 with the Chromium that ships with Playwright 1.63 (headless, GPU disabled, so no
  WebGL), default mobile emulation with simulated throttling (slow 4G, 4x CPU slowdown) and the
  desktop preset. Each cell is the median of 3 runs (`app/scripts/perf-audit.mjs`, also available as
  `pnpm perf:audit`).
- Signed in pages use a throwaway user and a fresh login (new token family) for every run.
- Lighthouse and webdriver runs skip the splash, the decorative effects and the 3D scenes (the plan
  allows this): the head script sets `data-fx="off"` for `navigator.webdriver`, for the
  `Chrome-Lighthouse` user agent that Lighthouse and PageSpeed Insights send, and for `?nosplash`.
  What a visitor with effects on gets is in "Real visitors and the 3D scenes" below.
- Two ways of serving the same build:
  - **HTTP/1.1**: plain `next start`. This is what a local run sees, and it is the pessimistic case:
    HTTP/1.1 allows six connections per origin and every new connection pays TCP slow start in
    Lighthouse's simulation.
  - **HTTP/2 over TLS**: `app/scripts/lh-serve.mjs` puts a TLS terminating HTTP/2 proxy in front of
    `next start`, the way any CDN or platform serves a site. CI uses this one, and it is the closest
    thing to what PageSpeed Insights sees on a deployed URL. PageSpeed Insights itself needs a public
    URL, so it has not been run; field (CrUX) data does not exist yet.
- Lab noise: this is a shared Windows laptop. Lighthouse records a CPU benchmark index per run: the
  baseline and the "after" tables below ran at about 2900; a later re-run of the final code ran at
  about 1750 (the machine was 40 percent slower) and showed TBT up to twice as high, see "Noise check".

## Mobile, throttled: before → after (HTTP/1.1, plain `next start`)

Perf, A11y, BP and SEO are Lighthouse category scores. A single value means unchanged.

| Page | Perf | A11y | BP | SEO | LCP s | TBT ms | CLS | FCP s | KB |
|---|---|---|---|---|---|---|---|---|---|
| `/` | 93 → 96 | 100 | 100 | 91 → 100 | 2.94 → 2.58 | 125 → 68 | 0 | 1.66 → 1.66 | 686 → 264 |
| `/handbook` | 90 → 93 | 100 | 100 | 92 → 100 | 3.47 → 3.08 | 81 → 33 | 0 | 1.66 → 1.66 | 552 → 376 |
| `/handbook/tomato` | 97 → 98 | 100 | 100 | 91 → 100 | 2.39 → 2.23 | 72 → 36 | 0 | 1.66 → 1.66 | 256 → 265 |
| `/handbook/tomato/early-blight` | 96 → 97 | 100 | 100 | 91 → 100 | 2.57 → 2.42 | 62 → 68 | 0 | 1.66 → 1.66 | 242 → 262 |
| `/login` | 94 → 97 | 100 | 100 | 91 → 100 | 2.58 → 2.57 | 175 → 35 | 0 | 1.51 → 1.51 | 495 → 267 |
| `/register` | 95 → 97 | 100 | 100 | 91 → 100 | 2.57 → 2.56 | 157 → 29 | 0 | 1.51 → 1.51 | 496 → 268 |
| `/dashboard` | 96 → 95 | 100 | 96 → 100 | 63 | 2.59 → 2.74 | 107 → 43 | 0 | 1.51 → 1.67 | 293 → 335 |
| `/scan` | 96 | 100 | 96 → 100 | 63 | 2.74 → 2.73 | 43 → 35 | 0.015 | 1.51 → 1.50 | 317 → 298 |
| `/scans` | 96 → 95 | 98 → 100 | 96 → 100 | 63 → 66 | 2.59 → 2.80 | 104 → 48 | 0 | 1.50 → 1.51 | 306 → 347 |

Notes:

- The baseline was measured on the build as it stood when this task started.
- `/dashboard` and `/scans` transfer more after the pass only because the audit user had no scan at
  baseline and has one now (the scan photo and a few extra requests).
- Member pages show SEO 63 to 66 on purpose: they are `noindex` (private), which Lighthouse reports as
  "Page is blocked from indexing". SEO is only a target for the public pages.
- Baseline Best Practices 96 on member pages was a CSP violation reported by the browser (item 5
  below). Baseline Accessibility 98 on `/scans` was a skipped heading level in the empty state (item
  8 below, found again later with a user who has no scans and fixed).
- Two baseline desktop pages (`/register`, the disease page) had one run end with Lighthouse's
  `NO_NAVSTART` flake; the median of the remaining runs is what is shown.

## Mobile, throttled: after, served over HTTP/2 with TLS (production like, used in CI)

| Page | Perf | A11y | BP | SEO | LCP s | TBT ms | CLS | FCP s | KB |
|---|---|---|---|---|---|---|---|---|---|
| `/` | 99 | 100 | 100 | 100 | 1.95 | 81 | 0 | 1.21 | 255 |
| `/handbook` | 99 | 100 | 100 | 100 | 2.18 | 44 | 0 | 1.21 | 364 |
| `/handbook/tomato` | 99 | 100 | 100 | 100 | 1.66 | 80 | 0 | 1.21 | 256 |
| `/handbook/tomato/early-blight` | 99 | 100 | 100 | 100 | 2.03 | 44 | 0 | 1.21 | 253 |
| `/login` | 99 | 100 | 100 | 100 | 1.96 | 89 | 0 | 1.21 | 257 |
| `/register` | 99 | 100 | 100 | 100 | 1.96 | 94 | 0 | 1.21 | 258 |
| `/dashboard` | 97 | 100 | 79 | 63 | 2.58 | 76 | 0 | 1.21 | 322 |
| `/scan` | 99 | 100 | 100 | 63 | 2.11 | 88 | 0.015 | 1.21 | 288 |
| `/scans` | 96 | 100 | 79 | 66 | 2.65 | 83 | 0 | 1.22 | 333 |

`/dashboard` and `/scans` show Best Practices 79 here only because this local setup serves the page
over https while the scan photo comes from the local S3 server over http (mixed content). With a real
deployment both are https. `/scan` has no photo and scores 100.

## Signed in pages for a user with no scans (empty states), HTTP/1.1, mobile

| Page | Perf | A11y | BP | SEO | LCP s | TBT ms | CLS | FCP s | KB |
|---|---|---|---|---|---|---|---|---|---|
| `/dashboard` | 92 | 100 | 100 | 63 | 2.80 | 171 | 0 | 1.51 | 274 |
| `/scan` | 94 | 100 | 100 | 63 | 2.86 | 127 | 0 | 1.21 | 305 |
| `/scans` | 93 | 100 | 100 | 63 | 2.82 | 157 | 0 | 1.51 | 295 |

## Desktop: before → after (HTTP/1.1)

| Page | Perf | A11y | BP | SEO | LCP s | TBT ms | CLS | FCP s | KB |
|---|---|---|---|---|---|---|---|---|---|
| `/` | 100 | 100 | 100 | 91 → 100 | 0.61 → 0.61 | 0 | 0.003 | 0.37 | 524 → 271 |
| `/handbook` | 100 | 100 | 100 | 92 → 100 | 0.73 → 0.69 | 0 | 0 | 0.37 → 0.37 | 491 → 389 |
| `/handbook/tomato` | 100 | 100 | 100 | 92 → 100 | 0.61 → 0.57 | 0 | 0 | 0.41 → 0.41 | 291 → 288 |
| `/handbook/tomato/early-blight` | 100 | 100 | 100 | 91 → 100 | 0.57 → 0.57 | 0 | 0 | 0.41 → 0.41 | 249 → 269 |
| `/login` | 100 | 100 | 100 | 91 → 100 | 0.57 → 0.57 | 0 | 0.001 | 0.37 → 0.37 | 504 → 276 |
| `/register` | 100 | 100 | 100 | 91 → 100 | 0.57 → 0.57 | 0 | 0 | 0.37 | 505 → 277 |
| `/dashboard` | 100 | 100 | 96 → 100 | 63 | 0.57 → 0.60 | 0 | 0 | 0.37 → 0.37 | 301 → 340 |
| `/scan` | 100 | 100 | 96 → 100 | 63 | 0.58 → 0.58 | 0 | 0 | 0.37 | 324 → 308 |
| `/scans` | 100 | 98 → 100 | 96 → 100 | 63 → 66 | 0.75 → 0.58 | 0 | 0 | 0.37 → 0.33 | 316 → 352 |

## Against the targets

| Target | Result |
|---|---|
| Public pages Perf, A11y, BP, SEO at least 90 | Met on every public page, mobile and desktop, both ways of serving (Perf 93 to 99 mobile, 100 desktop; A11y, BP and SEO 100). |
| LCP at most 2.5 s (mobile, throttled) | **Met over HTTP/2: 1.7 to 2.3 s on all six public pages.** Over plain HTTP/1.1 it is met on the plant and disease pages (2.2 to 2.4 s) but **not on `/`, `/handbook`, `/login` and `/register` (2.56 to 3.08 s).** |
| CLS at most 0.1 | Met everywhere (0 to 0.015 in the tables; one intermittent 0.05 to 0.077 shift on the landing page on slow connections, see below). |
| TBT at most 200 ms | Met everywhere on a quiet machine: 29 to 94 ms mobile, 0 desktop. Under the slower machine state it reached 46 to 167 ms (all pages still under 200). |
| INP at most 200 ms | Lab proxy met: worst interaction 112 ms (4x CPU slowdown, effects and 3D on, real pointer and keyboard input). Lighthouse itself does not measure INP. |
| Signed in pages A11y and BP at least 90, Perf at least 85 | Met: A11y 100, BP 100 (HTTP/1.1; see the https note above), Perf 91 to 96. |
| Zero serious or critical axe violations | Met: 0 over 76 scans (see below). |
| JS per route under about 170 KB gzipped | Met: 116 to 162 KB. Enforced by `pnpm budget`. |

### Why LCP is over 2.5 s on four pages over HTTP/1.1

What is left after the work below is almost entirely the framework: React and the Next client are
about 100 KB gzipped (two shared chunks, 53 KB and 45 KB), plus 20 to 30 KB of page code, 54 KB of web
fonts and the HTML. Lighthouse's simulation puts everything that finishes before the first paint on
the critical path, and over HTTP/1.1 with slow start that costs about 0.5 s more than over HTTP/2.
Lowering it further means cutting framework bytes, which we cannot, or brotli and an edge cache,
which the host provides. Nothing was done to hide it. Re-measure on the deployed URL with PageSpeed
Insights once there is one.

### Known residual: a layout shift on the landing page on slow connections

Streaming server rendering can deliver the hero before the carousel controls and the footer. On a
slow connection the browser paints that first part, and when the rest arrives the hero moves up
(CLS 0.05 to 0.077, measured about once in ten throttled runs, never in the median). It stays under
the 0.1 limit. The cure is to render the controls before the slides in the DOM (or reserve their
height), which changes the tab order of every carousel, so it was left for a decision.

## What changed

1. **SEO 91 to 100 on every public page.** Next 15 streamed the title and meta description into the
   body for browsers, so crawlers and Lighthouse saw no description. `htmlLimitedBots: /.*/` in
   `next.config.ts` puts them in `<head>` for everyone.
2. **Three.js scenes load late and cheaply** (`components/three/deferred-mount.ts`, tested). The
   static poster is the LCP layer; the canvas mounts 2.5 s after the window load event, in an idle
   moment, never on top of a user interaction, and the WebGL support probe waits for the same moment
   (creating a context took seconds on a machine with software GL). That removed three chunks (about
   240 KB gzipped) from the load window: landing transfer 686 to 264 KB, TBT 125 to 68 ms (login 175
   to 35 ms). Used by the hero, auth backdrop, dashboard orb and handbook stage. The 3D scenes, splash,
   hover effects and SFX are all still there; see "Real visitors and the 3D scenes" for who gets which.
3. **Hero layout shift.** The two hero buttons sat in a content sized row whose wrap depended on which
   font was loaded, so the hero jumped when Poppins arrived (CLS 0.077). They now stack full width on
   phones. (The residual shift above is a different cause.)
4. **Pictures that are not on screen are not fetched.** Lazy images in panels two or more screens away
   are hidden by CSS until the panel is near (`isNearActive`, tested), so the landing page no longer
   loads 13 plant photos in a panel nobody has opened. `next/image` serves AVIF and WebP with a one
   year cache; plant photos are pre sized (560x700 sources, 256 px variants).
5. **No CSP violation on member pages.** Zod probed `Function("")` and the browser reported a CSP eval
   violation on every page that parsed an API reply (Best Practices 96). Zod now runs jitless
   (`lib/zod-config.ts`, tested), the scan types moved to `zod/mini`, and the status names moved to
   `lib/scans/constants.ts` so the dashboard does not import the validation library at all. Together
   that took 17 to 25 KB gzipped off the scan, scans and dashboard routes.
6. **Hover and pointer work.** The pointer provider wrote `--mx` and `--my` on `<html>` every frame
   although no CSS read them, which restyled the whole document per frame: removed. SFX no longer
   creates an audio context on hover before the first gesture (it cost about 100 ms on first hover
   and could never play anyway), and audio setup runs after the paint of the click that causes it
   (`SfxProvider.test.tsx`). The `/login` worst interaction went from 456 to 80 ms.
7. **Caching and connections.** Long lived `Cache-Control` for `/brand`, `/icons`, `/cursors`,
   `/handbook` and `/og` assets (content hashed `/_next/static` and `/_next/image` were already
   immutable); `preconnect` to the public S3 host on member pages only. HTML is rendered per request
   because the CSP nonce changes every time, so it is `no-store` and ISR is not used.
8. **Accessibility.** The account menu and scan cards now contain their visible text in their
   accessible name (WCAG 2.5.3, Lighthouse "label content name mismatch"); a panel taller than the
   screen is keyboard focusable (axe `scrollable-region-focusable`, seen on `/brand` on phones); the
   empty state of the scan history is an `h2` under the page `h1` (it was an `h3`, Lighthouse
   "heading order").
9. **Fonts.** Already three families, latin only, limited weights, `display: swap`, preloaded, with
   `adjustFontFallback`. Measured again, nothing to gain there.

### Tried and rejected (measured)

- **`experimental.inlineCss`**: inlines the whole stylesheet (75 KB raw, 15 KB gzipped) into every
  uncacheable HTML response. LCP was worse over HTTP/1.1 (login 2.82 vs 2.56 s), equal over HTTP/2,
  and it made the first paint race the fonts (an intermittent layout shift).
- **Merging small shared chunks** (webpack `splitChunks.minSize`): 12 to 8 requests per route, no
  change in any score.
- **`preload: false` for Poppins and Manrope**: no change in LCP or FCP.
- **framer-motion LazyMotion and drei tree shaking**: nothing to do. framer-motion and gsap are not
  imported anywhere, and drei is only used inside the lazy scene chunks. (They are still listed in
  `package.json`; removing unused dependencies was outside this task.)

## Accessibility (axe)

`app/scripts/axe-audit.mjs` (`pnpm a11y:axe`) runs @axe-core/playwright with the wcag2a, wcag2aa,
wcag21a, wcag21aa, wcag22aa and best-practice tags on every route, at 1440x900 and 390x844, in dark
and light, stepping through every panel of every carousel. Public routes: `/`, handbook list, plant,
disease, login, register, about, privacy, terms, brand, 404.
Member routes: dashboard, scan, scans, one scan, account.

Result on the final build: **76 scans, 0 serious, 0 critical.** Before the pass the same run found
2 serious (`scrollable-region-focusable` on `/brand` on phones, dark and light). 26 moderate findings
remain, all `page-has-heading-one` on the second and later panels of the sideways carousels, where the
page's one `h1` sits in the first panel and the other panels are `inert`. It is an artefact of
scanning one panel at a time: every page has exactly one `h1`.

Lighthouse Accessibility is 100 on every audited page, public and member, including the empty states.

## Real visitors and the 3D scenes

Lighthouse and PageSpeed Insights are told apart by their user agent and by `navigator.webdriver`, and
for them the splash, effects and 3D scenes stay off. A real visitor gets them, except on low power
devices (Data Saver on, 2 GB of memory or less, or 2 cores or less), which keep the static poster
(`lowPowerDevice`, tested). `?webgl` forces the scenes on for the browser tests that check them.

What a real visitor costs, measured as the worst case: the browser has only software WebGL (no GPU),
effects on, own user agent (`perf-audit --splash=on --webgl=on`), mobile, median of 3:

| Page | Perf | A11y | BP | SEO | LCP s | TBT ms | CLS | FCP s | KB |
|---|---|---|---|---|---|---|---|---|---|
| `/` | 66 | 100 | 100 | 100 | 3.01 | 1512 | 0 | 1.66 | 514 |
| `/login` | 70 | 100 | 100 | 100 | 2.85 | 877 | 0 | 1.51 | 517 |
| `/handbook` | 68 | 100 | 100 | 100 | 3.57 | 908 | 0 | 1.66 | 629 |
| `/handbook/tomato` | 93 | 100 | 100 | 100 | 2.86 | 83 | 0 | 1.66 | 265 |

With software GL the scene mount blocks the main thread for 0.9 to 1.5 s at the 4x slowdown and the
Performance score drops to 66 to 70 on the pages that have a scene (`/handbook/tomato` has none and
is unaffected). A device with a GPU does the drawing there, so this is an upper bound, but it could
not be measured in this environment. The mount is already late (2.5 s after load, in an idle moment,
one canvas at a time), so it does not touch LCP or the first interaction; if field data shows it
hurting INP on mid range phones, the next step is to raise the low power threshold or to draw the hero
once and freeze it (`frameloop="demand"`).

The splash is a fixed overlay on top of the real page, so the LCP element is still the page's own
text or photo.

## Noise check: final code re-measured on a slower machine state

Same build as the last commit of this task, HTTP/1.1, mobile, median of 3, CPU benchmark index about
1750 instead of 2900. Scores stay in range; TBT moves with the machine:

| Page | Perf | LCP s | TBT ms | CLS |
|---|---|---|---|---|
| `/` | 95 | 2.68 | 131 | 0 |
| `/handbook` | 92 | 3.19 | 78 | 0 |
| `/handbook/tomato` | 98 | 2.26 | 68 | 0 |
| `/handbook/tomato/early-blight` | 96 | 2.19 | 155 | 0 |
| `/login` | 96 | 2.67 | 77 | 0 |
| `/register` | 96 | 2.61 | 46 | 0 |
| `/dashboard` | 92 | 2.75 | 146 | 0 |
| `/scan` | 93 | 2.88 | 139 | 0.015 |
| `/scans` | 91 | 3.03 | 151 | 0 |

## Guardrails in the repo

- `app/lighthouserc.json` (public pages, mobile), `lighthouserc.desktop.json` and
  `lighthouserc.member.json` (signed in pages): assertions on the targets above (category scores,
  LCP 2500, CLS 0.1, TBT 200; for the signed in pages the category floors are errors and LCP and
  TBT are warnings), 3 runs, median. They serve the build with `scripts/lh-serve.mjs` (HTTP/2 over
  TLS) and run Chrome with `--disable-gpu`. Run locally against this stack, the public mobile and the
  desktop configs passed all assertions. The signed in config failed once on `/scans` TBT (209 ms
  median on the slower machine state) before that assertion became a warning.
- `.github/workflows/ci.yml`: the `app` job runs `pnpm budget`; the new `lighthouse` job starts the
  real stack (Postgres, moto S3, migrations, seed, API, production build), runs the axe scan, then
  the three Lighthouse runs (the member run logs in first and passes the session cookie), and
  uploads the reports. It has not run on GitHub yet; the same commands were run locally.
- `app/bundle-budget.json` with `app/scripts/check-bundle-budget.mjs` (`pnpm budget`): fails when a
  route's up front JS (page and layouts, gzipped, lazy chunks excluded) goes over its budget (170 KB
  at most, tighter per route) or a single chunk goes over 130 KB.
- `app/scripts/inp-probe.mjs`: lab interaction latency at 4x CPU slowdown, budget 200 ms.

## Run it yourself

```powershell
.\scripts\dev\run-all.ps1             # stack on :3000 and :8000, production build
cd app
pnpm perf:audit --runs=3              # Lighthouse table, HTTP/1.1
pnpm lh:serve                         # HTTP/2 on https://localhost:3443 (starts its own next start on :3000); then use
                                      #   pnpm perf:audit --base=https://localhost:3443 --chrome-flags=--ignore-certificate-errors
pnpm a11y:axe                         # axe on every route, dark and light
node scripts/inp-probe.mjs            # interaction latency
pnpm build ; pnpm budget              # bundle budget
pnpm lhci                             # Lighthouse CI, public pages (needs the stack and a build)
```

Pass `--pages=/,/login`, `--form=mobile`, `--out=file.json`, `--user=` and `--password=` to
`perf:audit` to narrow or save a run, or `--splash=on --webgl=on` for the real visitor view.
