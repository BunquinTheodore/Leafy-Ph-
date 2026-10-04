// Flow 6: handbook browse (public).
import { FLOW_LAYOUT, layoutDiagram } from '../lib/diagram.mjs';

export default async function flowHandbook(ctx) {
  return layoutDiagram({
    alt: 'Handbook browse, public. /handbook shows a plants carousel with search across plants and diseases. A plant opens /handbook/[plant] with growth conditions and its diseases in a second row, or No diseases catalogued yet for Blueberry and Soybean. A disease opens /handbook/[plant]/[disease] with six panels and a deep link per panel. The footer asks Think your plant has this and leads to Scan a leaf.',
    nodes: [
      { id: 'hb', row: 0, col: 0, title: '/handbook', sub: 'Plants carousel and search', kind: 'primary' },
      { id: 'plant', row: 0, col: 1, title: '/handbook/[plant]', sub: 'Overview with growth conditions, diseases as a second row' },
      { id: 'disease', row: 0, col: 2, title: '/handbook/[plant]/[disease]', sub: 'Panels: Overview, Causes, Symptoms, Treatment, Prevention, Images' },
      { id: 'cta', row: 0, col: 3, title: 'Scan a leaf', sub: 'Footer: Think your plant has this?' },
      { id: 'search', row: 1, col: 0, title: 'Search', sub: 'Across plants and diseases, URL stays shareable' },
      { id: 'deep', row: 1, col: 2, title: 'Deep link', sub: 'Hash per panel, for example #treatment' },
      { id: 'scanpage', row: 1, col: 3, title: '/scan or /login?next=/scan', sub: 'Signed out visitors sign in first', kind: 'external' },
      { id: 'empty', row: 1, col: 1, title: 'No diseases catalogued yet', sub: 'Shown for Blueberry and Soybean' },
    ],
    edges: [
      { from: 'hb', to: 'plant', label: 'plant' },
      { from: 'plant', to: 'disease', label: 'disease' },
      { from: 'disease', to: 'cta', label: 'footer' },
      { from: 'hb', to: 'search', label: 'type' },
      { from: 'search', to: 'plant', label: 'plant match', style: 'optional', labelSide: 'left', labelShift: 70 },
      { from: 'disease', to: 'deep', label: 'share panel', style: 'optional' },
      { from: 'cta', to: 'scanpage', label: 'open' },
      { from: 'plant', to: 'empty', label: 'no diseases', style: 'optional', fromAt: 0.85, toAt: 0.85 },
    ],
    options: { gapX: 52, gapY: 60, fillMaxExtra: 150, maxNodeW: 165, ...FLOW_LAYOUT },
  }, ctx);
}
