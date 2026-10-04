// Sample diagram: the Leafy request path. Replace or copy this file for real diagrams.
// A diagram module default exports an async function (ctx) -> layoutDiagram(...) result.
import { layoutDiagram } from '../lib/diagram.mjs';

export default async function sample(ctx) {
  return layoutDiagram({
    alt: 'Architecture sketch: the browser talks only to Next.js, which proxies to FastAPI; FastAPI uses Postgres, MinIO and Mailpit, and Google for sign in.',
    lanes: [
      { id: 'client', label: 'Client' },
      { id: 'web', label: 'Web tier' },
      { id: 'api', label: 'API tier' },
      { id: 'data', label: 'Data and services' },
    ],
    nodes: [
      { id: 'browser', lane: 'client', col: 1, title: 'Browser', sub: 'Leafy UI, cookies only', kind: 'primary' },
      { id: 'google', lane: 'client', col: 3, title: 'Google', sub: 'OAuth consent screen', kind: 'external' },
      { id: 'next', lane: 'web', col: 1, title: 'Next.js 15', sub: 'Pages and route handlers', kind: 'primary' },
      { id: 'api', lane: 'api', col: 1, title: 'FastAPI', sub: 'Routers, services, repositories', kind: 'primary' },
      { id: 'pg', lane: 'data', col: 0, title: 'PostgreSQL', sub: 'Users, scans, catalog', kind: 'store' },
      { id: 'minio', lane: 'data', col: 1, title: 'MinIO (S3)', sub: 'Scan images, catalog images', kind: 'store' },
      { id: 'mail', lane: 'data', col: 2, title: 'Mailpit', sub: 'Dev SMTP inbox', kind: 'external' },
    ],
    edges: [
      { from: 'browser', to: 'next', label: 'HTTPS page and API calls' },
      { from: 'next', to: 'browser', label: 'HTML, JSON, cookies', style: 'response', fromSide: 'right', toSide: 'right' },
      { from: 'next', to: 'api', label: 'REST /api/v1' },
      { from: 'api', to: 'pg', label: 'SQL (asyncpg)' },
      { from: 'api', to: 'minio', label: 'presigned URLs' },
      { from: 'api', to: 'mail', label: 'SMTP', style: 'optional' },
      { from: 'api', to: 'google', label: 'code exchange', style: 'optional', fromSide: 'right', toSide: 'bottom' },
    ],
    options: { gapX: 60, maxNodeW: 180 },
  }, ctx);
}
