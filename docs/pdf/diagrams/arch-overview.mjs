// Section 3: system architecture overview. Every arrow is one call, numbered to match the calls table.
import { layoutDiagram } from '../lib/diagram.mjs';

export default async function archOverview(ctx) {
  return layoutDiagram({
    alt: 'System architecture. The browser talks only to Next.js (middleware, pages, route handlers). Next.js calls the FastAPI REST API with a bearer token. FastAPI uses PostgreSQL, S3 storage and the ML service (there is no email system), and fetches Google public certificates to check Firebase ID tokens for Google sign in. The browser loads scan images straight from S3 with presigned links.',
    lanes: [
      { id: 'client', label: 'Client' },
      { id: 'web', label: 'Web tier' },
      { id: 'api', label: 'API tier' },
      { id: 'svc', label: 'Services' },
    ],
    nodes: [
      { id: 'browser', lane: 'client', col: 1, title: 'Browser', sub: 'Leafy UI. Holds cookies, never tokens', kind: 'primary' },
      { id: 'google', lane: 'client', col: 3, title: 'Google', sub: 'Firebase Auth popup, public certificates', kind: 'external' },
      { id: 'pages', lane: 'web', col: 0, title: 'Pages', sub: 'Server components and apiFetch' },
      { id: 'mw', lane: 'web', col: 1, title: 'middleware.ts', sub: 'Refresh, route guards, CSP headers' },
      { id: 'rh', lane: 'web', col: 2, title: 'Route handlers', sub: '/api/auth (incl. google), /api/me, /api/scans' },
      { id: 'api', lane: 'api', col: 1, title: 'FastAPI /api/v1', sub: 'Router, controller, service, repository', kind: 'primary' },
      { id: 's3', lane: 'svc', col: 0, title: 'S3 storage', sub: 'MinIO in dev, two buckets', kind: 'store' },
      { id: 'pg', lane: 'svc', col: 1, title: 'PostgreSQL 16', sub: 'Users, scans, catalog', kind: 'store' },
      { id: 'ml', lane: 'svc', col: 3, title: 'ML service', sub: 'predict(image), written by the team', kind: 'external' },
    ],
    edges: [
      { from: 'browser', to: 'mw', label: '1 page or /api request' },
      { from: 'mw', to: 'pages', label: '2 pages' },
      { from: 'mw', to: 'rh', label: '3 /api' },
      { from: 'mw', to: 'api', label: '4 POST /auth/refresh' },
      { from: 'pages', to: 'api', label: '5 apiFetch + bearer', fromSide: 'bottom', toSide: 'left' },
      { from: 'rh', to: 'api', label: '6 proxy + bearer', fromSide: 'bottom', toSide: 'right' },
      { from: 'rh', to: 'browser', label: '7 JSON + Set-Cookie', style: 'response', fromSide: 'top', toSide: 'right' },
      { from: 'pages', to: 'browser', label: '8 HTML', style: 'response', fromSide: 'top', toSide: 'left' },
      { from: 'api', to: 'pg', label: '9 SQL (asyncpg)' },
      { from: 'api', to: 'ml', label: '10 predict' },
      { from: 'api', to: 's3', label: '11 put, delete, presign', onLine: true },
      { from: 'browser', to: 'google', label: '12 sign in popup', style: 'optional', fromSide: 'right', toSide: 'left' },
      { from: 'api', to: 'google', label: '13 public certs', style: 'optional', fromSide: 'right', toSide: 'bottom' },
      { from: 'browser', to: 's3', label: '14 GET image', fromSide: 'left', toSide: 'left', stubTo: 30, onLine: true },
    ],
    options: { gapX: 44, gapY: 40, maxNodeW: 150, lanePad: 24, laneGap: 14, padY: 6, labelSize: 13, labelPad: 5, labelGap: 11, outerX: 46, labelClear: 4, boxCues: true,
      edgeStyles: { response: { dash: '10 5', width: 2 }, optional: { width: 3, dash: '0.1 7' } },
      kindStyles: { primary: { sw: 3 } } },
  }, ctx);
}
