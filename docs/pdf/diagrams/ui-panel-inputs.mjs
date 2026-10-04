// Panel navigation: every input reaches SlidePanels, which produces the visible and announced result.
import { layoutDiagram, PALETTE } from '../lib/diagram.mjs';

export default async function uiPanelInputs(ctx) {
  return layoutDiagram({
    alt: 'Panel navigation. Arrow buttons and dots, the keyboard, swipe drag and wheel, and a URL hash link all go into SlidePanels. SlidePanels slides to the panel or cross fades when motion is reduced, updates the URL hash, announces the panel with aria live and plays a panel sound.',
    lanes: [
      { id: 'in', label: 'Input' },
      { id: 'comp', label: 'SlidePanels' },
      { id: 'out', label: 'Result' },
    ],
    nodes: [
      { id: 'btn', lane: 'in', col: 0, title: 'Arrows and dots', sub: 'Click, tap, 44 px targets, hover preview', kind: 'primary' },
      { id: 'key', lane: 'in', col: 1, title: 'Keyboard', sub: 'Left and right arrow keys' },
      { id: 'drag', lane: 'in', col: 2, title: 'Swipe, drag, wheel', sub: 'Touch, mouse drag, Shift plus wheel, trackpad, rubber band' },
      { id: 'hash', lane: 'in', col: 3, title: 'URL hash link', sub: 'For example #treatment, shareable', kind: 'external' },
      { id: 'sp', lane: 'comp', col: 0, spanTo: 3, title: 'SlidePanels', sub: 'CSS scroll snap base plus framer motion or GSAP', kind: 'primary' },
      { id: 'move', lane: 'out', col: 0, title: 'Panel moves', sub: 'Slide, or cross fade if reduced motion' },
      { id: 'live', lane: 'out', col: 1, title: 'aria-live', sub: 'Announces the panel title' },
      { id: 'url', lane: 'out', col: 2, title: 'URL hash', sub: 'Back and forward work', kind: 'store' },
      { id: 'snd', lane: 'out', col: 3, title: 'Panel sound', sub: 'Leaf rustle, 220 ms', kind: 'external' },
    ],
    // SlidePanels is a wide bar over all four columns, so every arrow has its own port on it and runs straight
    // down. Lane borders stay clear of labels (avoidLaneEdges): each label sits beside its own arrow, inside a
    // lane or in the gap between lanes.
    edges: [
      { from: 'btn', to: 'sp', label: 'prev, next, jump', fromSide: 'bottom', toSide: 'top' },
      { from: 'key', to: 'sp', label: 'key press', fromSide: 'bottom', toSide: 'top' },
      { from: 'drag', to: 'sp', label: 'gesture', fromSide: 'bottom', toSide: 'top' },
      { from: 'hash', to: 'sp', label: 'open on load', fromSide: 'bottom', toSide: 'top' },
      { from: 'sp', to: 'move', label: 'animate', style: 'response', fromSide: 'bottom', toSide: 'top' },
      { from: 'sp', to: 'live', label: 'announce', style: 'response', fromSide: 'bottom', toSide: 'top' },
      { from: 'sp', to: 'url', label: 'write hash', style: 'response', fromSide: 'bottom', toSide: 'top' },
      { from: 'sp', to: 'snd', label: 'play', style: 'optional', fromSide: 'bottom', toSide: 'top' },
    ],
    // Larger type and roomier gaps so the figure fills the landscape page. The dotted (optional) arrow uses the same
    // green as the other arrows: the dot pattern alone marks it as optional.
    options: {
      gapX: 36, gapY: 48, maxNodeW: 176, avoidLaneEdges: true, lanePad: 30, laneGap: 32, laneLabelMax: 100,
      fontSize: { title: 14.5, sub: 13, label: 12.5, lane: 13 },
      edgeStyles: { optional: { color: PALETTE.brand } },
    },
  }, ctx);
}
