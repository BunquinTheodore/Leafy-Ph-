// Section 5: the scan state machine shared by the API and the UI.
import { layoutDiagram } from '../lib/diagram.mjs';

export default async function scanState(ctx) {
  return layoutDiagram({
    alt: 'Scan state machine. A scan starts as uploading on the client, then moves through processing with the stages validating, analyzing and saving, and ends as completed with a verdict of disease, healthy or unknown. Any processing stage can end as failed with a failure code. Retry returns a failed scan to analyzing using the stored image. Delete is allowed from completed and from failed, and also cancels a processing scan.',
    nodes: [
      { id: 'uploading', row: 0, col: 0, title: 'uploading', sub: 'Client only. Real percent, cancel button' },
      { id: 'validating', row: 0, col: 1, title: 'processing', sub: 'stage: validating', kind: 'primary' },
      { id: 'analyzing', row: 0, col: 2, title: 'processing', sub: 'stage: analyzing. predict() runs', kind: 'primary' },
      { id: 'saving', row: 0, col: 3, title: 'processing', sub: 'stage: saving', kind: 'primary' },
      { id: 'completed', row: 0, col: 4, title: 'completed', sub: 'verdict: disease, healthy or unknown', kind: 'store' },
      { id: 'failed', row: 1, col: 2, title: 'failed', sub: 'failure_code: prediction_failed or ml_unavailable. Image is kept', kind: 'external' },
      { id: 'deleted', row: 1, col: 4, title: 'deleted', sub: 'Row removed. Image key queued for S3 removal', kind: 'external' },
    ],
    edges: [
      { from: 'uploading', to: 'validating', label: '202' },
      { from: 'validating', to: 'analyzing', label: 'ok' },
      { from: 'analyzing', to: 'saving', label: 'ok' },
      { from: 'saving', to: 'completed', label: 'ok' },
      { from: 'validating', to: 'failed', label: 'error', fromSide: 'bottom', toSide: 'left' },
      { from: 'failed', to: 'analyzing', label: 'retry', style: 'optional', width: 3.6, fromSide: 'top', toSide: 'bottom', fromAt: 0.1, toAt: 0.1 },
      { from: 'analyzing', to: 'failed', label: 'ML error or timeout', fromAt: 0.9, toAt: 0.9 },
      { from: 'saving', to: 'failed', label: 'error', fromSide: 'bottom', toSide: 'right', toAt: 0.8, onLine: true },
      { from: 'completed', to: 'deleted', label: 'delete' },
      { from: 'failed', to: 'deleted', label: 'delete', fromSide: 'bottom', toSide: 'bottom', fromAt: 0.5, toAt: 0.5, stubFrom: 28, stubTo: 28 },
    ],
    options: {
      gapX: 60, gapY: 90, maxNodeW: 140, padY: 12, portSep: 64, labelGap: 10, margin: 8,
      // the saving error label is centered on its vertical line; the retry dots use the connector green so the dotted style carries the meaning
      fillHeight: 500, fillMaxExtra: 80, edgeStyles: { optional: { color: '#23813a' } },
    },
  }, ctx);
}
