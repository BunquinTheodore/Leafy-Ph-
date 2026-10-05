# Wide layout system

Source: `wide-layout.css` (imported in `app/globals.css`), SlidePanels rules in `layout.css`.
Goal: content is one balanced group centered in the viewport, never pinned to opposite edges.

## Page skeleton

```tsx
<div className="stage-fill wide-stage" data-width="standard">
  {" "}
  {/* narrow | standard | wide */}
  <div className="wide-container">
    {" "}
    {/* centered, vertically balanced */}
    <div className="split split--top">
      {" "}
      {/* heading block + companion */}
      <div className="stack">...title, text, actions...</div>
      <div className="decor-cell">
        <Leaf data-decor aria-hidden="true" />
      </div>
    </div>
  </div>
</div>
```

`.stage-fill` supplies the height (viewport minus header and footer); `.wide-stage` supplies the
gutters (`--gutter`), the vertical padding and `overflow`. `.wide-container` is `margin: auto`, so
it centers vertically when short and starts at the top when taller than the stage.

## Classes

| Class                                                                                              | Use                                                                                                                                           |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `.wide-stage`                                                                                      | Flex column stage with symmetrical gutters. Add to the element that has `.stage-fill`.                                                        |
| `.wide-container`                                                                                  | Centered group, `width: min(100%, var(--container-max))`.                                                                                     |
| `.wide-container--narrow` `--standard` `--wide` (or `data-width` on the stage or on `SlidePanels`) | 1100, 1360 and 1680px bases (standard is the default).                                                                                        |
| `.split`                                                                                           | Two columns, gap `--split-gap` = `clamp(24px, 5vw, 120px)`, centered vertically, stacks below 960px.                                          |
| `.split--top`                                                                                      | Align column tops. `.split--text-wide` (1.25/0.75), `.split--media-wide` (0.8/1.2), `.split--hug` (columns sized to content, group centered). |
| `.stack`                                                                                           | Vertical flex with `--stack-gap`, left aligned.                                                                                               |
| `.card-grid`                                                                                       | Auto fit grid that fills its row, items keep their own height (`align-items: start`).                                                         |
| `.rail`                                                                                            | Horizontal row that centers when it does not fill the width and scrolls when it does.                                                         |
| `.ui-scaled`                                                                                       | `font-size: 1rem * --ui-scale`; use `em` inside so everything grows.                                                                          |
| `.display-scaled`                                                                                  | Josefin display title that grows with `--ui-scale` (use with `.display`).                                                                     |

## Scaling on 1600px and wider

`--container-scale` (container widths) and `--ui-scale` (type, cards, imagery) step up:

| Viewport    | `--container-scale` | `--ui-scale`             |
| ----------- | ------------------- | ------------------------ |
| below 1600  | 1                   | 1                        |
| 1600 and up | 1.1                 | 1.1 (height 780 and up)  |
| 1900 and up | 1.3                 | 1.2 (height 820 and up)  |
| 2300 and up | 1.65                | 1.45 (height 980 and up) |

The height gates keep short wide screens such as 2560x1080 from overflowing. Size things with
`calc(280px * var(--ui-scale))` or `em` inside `.ui-scaled`.

## Decoration

Anything decorative (leaves, glows, 3D scene poster) gets `data-decor` and `aria-hidden="true"`.
`[data-decor]` is `pointer-events: none`. It must live in its own grid cell (`.decor-cell`, inside
a `.split`) or in the side margins (`.decor-margin--start` or `--end`, a child of `.wide-stage`,
visible from 1700px) and must never intersect a text, input, button or icon rectangle. The layout
test `tests/e2e-layout/wide-layout.spec.ts` fails when it does.

## SlidePanels

Slides and the controls row share `--container-max`, so panel content lines up with the page title
at one left edge. Pass `width="wide"` (optional) to pick a width. Short slides are centered
vertically, tall slides start at the top and scroll inside the panel. API otherwise unchanged.

## Layout checks and screenshots

```
$env:BASE_URL="http://localhost:3200"; pnpm exec playwright test -c playwright.layout.config.ts
node scripts/shoot-wide.mjs http://localhost:3200 ../docs/screens/wide-layout/<area>
```

Add routes in `tests/e2e-layout/routes.ts`.
