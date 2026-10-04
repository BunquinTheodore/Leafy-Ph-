// Flow 5: history, delete with undo.
import { FLOW_LAYOUT, layoutDiagram } from '../lib/diagram.mjs';

export default async function flowHistory(ctx) {
  return layoutDiagram({
    alt: 'History and delete with undo. /scans shows a card rail with filters, newest first. Opening a card goes to /scans/[id]. Delete opens a confirm dialog, then an Undo toast for about 6 seconds. Undo keeps the scan; when the time passes the purge runs and the user returns to the list. An empty list shows No scans yet with a Scan button, and a processing scan opens its live progress.',
    nodes: [
      { id: 'list', row: 0, col: 0, title: '/scans', sub: 'Card rail with paging, grid toggle, filters by plant and verdict, newest first', kind: 'primary' },
      { id: 'detail', row: 0, col: 1, title: '/scans/[id]', sub: 'Same panels as the result. Delete scan on every panel' },
      { id: 'confirm', row: 0, col: 2, title: 'Confirm dialog', sub: 'Delete this scan?' },
      { id: 'undo', row: 0, col: 3, title: 'Undo toast', sub: 'About 6 s before the purge runs' },
      { id: 'empty', row: 1, col: 0, title: 'No scans yet', sub: 'Empty state with a Scan a leaf button' },
      { id: 'live', row: 1, col: 1, title: 'Processing scan', sub: 'Live Analyzing badge. Opens the progress, then the result' },
      { id: 'kept', row: 1, col: 2, title: 'Scan kept', sub: 'Toast closes. Nothing was deleted' },
      { id: 'purge', row: 1, col: 3, title: 'Purge runs', sub: 'DELETE /scans/{id}. Image key queued for S3 removal' },
      { id: 'back', row: 2, col: 2, title: 'Back on the list', sub: 'Toast says Scan deleted or Scan kept', kind: 'primary' },
    ],
    edges: [
      { from: 'list', to: 'detail', label: 'open card' },
      { from: 'detail', to: 'confirm', label: 'Delete' },
      { from: 'confirm', to: 'undo', label: 'confirm' },
      { from: 'list', to: 'empty', label: 'no scans', style: 'optional' },
      { from: 'list', to: 'live', label: 'tap badge', style: 'optional' },
      { from: 'undo', to: 'kept', label: 'Undo', fromSide: 'bottom', toSide: 'top', fromAt: 0.2, toAt: 0.7 },
      { from: 'undo', to: 'purge', label: '6 s pass', fromAt: 0.7 },
      { from: 'kept', to: 'back', label: 'return', style: 'response', fromSide: 'bottom', toSide: 'top' },
      { from: 'purge', to: 'back', label: 'return', style: 'response', fromSide: 'bottom', toSide: 'right', labelAt: 1 },
    ],
    options: { gapX: 52, gapY: 56, maxNodeW: 170, ...FLOW_LAYOUT },
  }, ctx);
}
