// Section 3: the FastAPI layers. Request path goes left to right on the top row, comes back on the second row.
import { layoutDiagram } from '../lib/diagram.mjs';

export default async function archApiLayers(ctx) {
  return layoutDiagram({
    alt: 'FastAPI layers. A request passes middleware, a router, a controller and a service. The service uses repositories for SQL against PostgreSQL, and adapters for S3 storage, SMTP email and the ML service.',
    nodes: [
      { id: 'next', row: 0, col: 0, title: 'Next.js', sub: 'Server side URL only', kind: 'external' },
      { id: 'mw', row: 0, col: 1, title: 'Middleware', sub: 'Request id, security headers, body size cap' },
      { id: 'router', row: 0, col: 2, title: 'Routers', sub: 'auth, users, scans, catalog, health. No logic' },
      { id: 'ctrl', row: 0, col: 3, title: 'Controllers', sub: 'Request to service to DTO. No SQL, no commit' },
      { id: 'pg', row: 1, col: 1, title: 'PostgreSQL 16', sub: 'citext and pg_trgm', kind: 'store' },
      { id: 'repo', row: 1, col: 2, title: 'Repositories', sub: 'SQL only: user, refresh_token, auth_token, catalog, scan, storage_outbox' },
      { id: 'svc', row: 1, col: 3, title: 'Services', sub: 'Business rules, one UnitOfWork per request, domain errors', kind: 'primary' },
      { id: 'email', row: 2, col: 1, title: 'email_service', sub: 'SMTP, html and text templates' },
      { id: 'storage', row: 2, col: 2, title: 'storage_service', sub: 'S3 client in a threadpool' },
      { id: 'mlsvc', row: 2, col: 3, title: 'ML adapter', sub: 'MLInferenceService, stub or plug in, in a threadpool' },
      { id: 'smtp', row: 3, col: 1, title: 'SMTP', sub: 'Mailpit in dev', kind: 'external' },
      { id: 's3', row: 3, col: 2, title: 'S3 storage', sub: 'leafy-scans and leafy-catalog', kind: 'store' },
      { id: 'mlimpl', row: 3, col: 3, title: 'predict()', sub: 'ML_SERVICE=pkg.mod:Class', kind: 'external' },
    ],
    edges: [
      { from: 'next', to: 'mw', label: '1 HTTP' },
      { from: 'mw', to: 'router', label: '2 request' },
      { from: 'router', to: 'ctrl', label: '3 call' },
      { from: 'ctrl', to: 'svc', label: '4 call' },
      { from: 'svc', to: 'repo', label: '5 queries' },
      { from: 'repo', to: 'pg', label: '6 SQL' },
      { from: 'svc', to: 'mlsvc', label: '7 predict' },
      // Numbers read left to right along the bottom. Mail is listed first so it takes the left port on Services;
      // it turns on the upper track (12 px below Services), files on the lower track (54 px). stubTo is set so each
      // stub ends on the same y as its track, which fixes the track. Elbows are 42 px apart, ports 46 px; labels sit on the drops.
      { from: 'svc', to: 'email', label: '8 mail', fromSide: 'bottom', toSide: 'top', stubFrom: 12, stubTo: 88, fromAt: 0, labelAt: 'end', labelTight: true },
      { from: 'svc', to: 'storage', label: '9 files', fromSide: 'bottom', toSide: 'top', stubFrom: 54, stubTo: 46, fromAt: 0.27, labelAt: 'end', labelTight: true },
      { from: 'email', to: 'smtp', label: '10 SMTP' },
      { from: 'storage', to: 's3', label: '11 put, delete, presign' },
      { from: 'mlsvc', to: 'mlimpl', label: '12 plug in', style: 'optional' },
    ],
    options: { gapX: 44, gapY: 50, gapYRows: [46, 100, 68], padY: 5, outerY: 10, maxNodeW: 170, labelSize: 13, labelPad: 5, labelClear: 3, labelObstacles: false, boxCues: true,
      edgeStyles: { response: { dash: '10 5', width: 2 }, optional: { width: 3, dash: '0.1 7' } },
      kindStyles: { primary: { sw: 3 } },
      legendPanel: { row: 1, items: [{ line: 'request', text: 'Call' }, { line: 'optional', text: 'Optional' }, { box: 'external', text: 'Outside' }, { box: 'store', text: 'Data store' }] } },
  }, ctx);
}
