// Flow 1: first visit.
import { FLOW_LAYOUT, layoutDiagram } from '../lib/diagram.mjs';

export default async function flowFirstVisit(ctx) {
  return layoutDiagram({
    alt: 'First visit. The splash screen shows, then the landing page with sideways panels. Scan a leaf asks whether the visitor is signed in: yes goes to /scan, no goes to /login?next=/scan and back to /scan after signing in. Browse the handbook opens the public handbook without an account.',
    nodes: [
      { id: 'splash', row: 0, col: 0, title: 'Splash', sub: 'Hard load only, max 2.2 s' },
      { id: 'landing', row: 0, col: 1, title: 'Landing /', sub: 'Sideways panels: Hero, How it works, Plants, Why Leafy, FAQ, final call', kind: 'primary' },
      { id: 'scancta', row: 0, col: 2, title: 'Scan a leaf', sub: 'Primary button' },
      { id: 'signed', row: 0, col: 3, title: 'Signed in?', sub: 'Checked by middleware', kind: 'external' },
      { id: 'scan', row: 1, col: 2, title: '/scan', sub: 'Tip card and dropzone', kind: 'primary' },
      { id: 'login', row: 1, col: 3, title: '/login?next=/scan', sub: 'Sign in or register' },
      { id: 'handcta', row: 2, col: 1, title: 'Browse the handbook', sub: 'Secondary button, no account needed' },
      { id: 'handbook', row: 2, col: 2, title: '/handbook', sub: 'Public plants and diseases' },
      { id: 'pages', row: 2, col: 3, title: 'Plant and disease pages', sub: 'See flow 6' },
    ],
    edges: [
      { from: 'splash', to: 'landing', label: 'ready' },
      { from: 'landing', to: 'scancta', label: 'scan' },
      { from: 'scancta', to: 'signed', label: 'tap' },
      { from: 'signed', to: 'scan', label: 'yes', fromSide: 'bottom', toSide: 'top' },
      { from: 'signed', to: 'login', label: 'no' },
      { from: 'login', to: 'scan', label: 'then', style: 'response' },
      { from: 'landing', to: 'handcta', label: 'browse' },
      { from: 'handcta', to: 'handbook', label: 'open' },
      { from: 'handbook', to: 'pages', label: 'pick' },
    ],
    options: { gapX: 52, gapY: 52, maxNodeW: 160, padY: 14, ...FLOW_LAYOUT },
  }, ctx);
}
