// Flow 7: dashboard.
import { FLOW_LAYOUT, layoutDiagram } from '../lib/diagram.mjs';

export default async function flowDashboard(ctx) {
  return layoutDiagram({
    alt: 'Dashboard. Opening /dashboard while signed out goes to /login?next=/dashboard. The dashboard loads the user, the scan stats and the recent scans and shows stat tiles, the top 5 diseases and a recent scans rail. The primary button opens /scan. An empty account shows a guided first scan prompt.',
    nodes: [
      { id: 'scan', row: 0, col: 0, title: '/scan', sub: 'Primary action' },
      { id: 'cta', row: 0, col: 1, title: 'Scan a leaf button', sub: 'One obvious next action' },
      { id: 'tiles', row: 0, col: 2, title: 'Stat tiles', sub: 'Total scans, last 30 days, healthy, diseased, unknown' },
      { id: 'entry', row: 1, col: 0, title: 'Open /dashboard', sub: 'Signed out goes to /login?next=/dashboard', kind: 'external' },
      { id: 'dash', row: 1, col: 1, title: 'Dashboard', sub: 'GET /users/me, /scans/stats, /scans', kind: 'primary' },
      { id: 'top5', row: 1, col: 2, title: 'Top 5 diseases', sub: 'From completed scans' },
      { id: 'handbook', row: 1, col: 3, title: 'Disease page', sub: 'Plant scoped handbook URL' },
      { id: 'empty', row: 2, col: 1, title: 'Guided first scan', sub: 'Empty account prompt' },
      { id: 'rail', row: 2, col: 2, title: 'Recent scans rail', sub: 'Newest first, live badges' },
      { id: 'detail', row: 2, col: 3, title: '/scans/[id]', sub: 'Open a scan' },
    ],
    edges: [
      { from: 'entry', to: 'dash', label: 'signed in' },
      { from: 'dash', to: 'cta', label: 'primary', fromSide: 'top', toSide: 'bottom' },
      { from: 'cta', to: 'scan', label: 'open' },
      { from: 'dash', to: 'tiles', label: 'totals', fromSide: 'right', toSide: 'left', fromAt: 0.15 },
      { from: 'dash', to: 'top5', label: 'top 5', fromAt: 0.5, toAt: 0.5 },
      { from: 'dash', to: 'rail', label: 'recent', fromSide: 'right', toSide: 'left', fromAt: 0.85 },
      { from: 'top5', to: 'handbook', label: 'open' },
      { from: 'rail', to: 'detail', label: 'open' },
      { from: 'dash', to: 'empty', label: 'no scans', style: 'optional', fromSide: 'bottom', toSide: 'top', fromAt: 0.6 },
    ],
    options: { gapX: 84, gapY: 52, maxNodeW: 150, padY: 12, portSep: 24, ...FLOW_LAYOUT },
  }, ctx);
}
