// Flow 4: scan a leaf, with the four outcomes.
import { FLOW_LAYOUT, layoutDiagram } from '../lib/diagram.mjs';

export default async function flowScan(ctx) {
  return layoutDiagram({
    alt: 'Scan a leaf. On /scan the user picks or photographs a leaf, previews it and taps Analyze leaf. A progress screen runs Uploading, Checking image, Analyzing leaf and Saving result while the page polls GET /scans/{id}. The result is one of four outcomes: unknown, failed, healthy or disease found. Unknown returns to /scan for a new photo, failed can retry with the stored image. On a completed result the Result panel asks Was this result correct, Yes or No, with an optional correction. The user may leave the page; the scan continues and shows in History.',
    nodes: [
      { id: 'scan', row: 0, col: 0, title: '/scan', sub: 'Tip card, dropzone, Take photo on phones. Unverified: Verify your email to scan', kind: 'primary' },
      { id: 'preview', row: 0, col: 1, title: 'Preview', sub: 'Retake or Analyze leaf. Checks type, size, dimensions' },
      { id: 'progress', row: 0, col: 2, title: 'Progress', sub: 'Uploading, Checking image, Analyzing leaf, Saving result' },
      { id: 'history', row: 0, col: 3, title: 'History', sub: 'Live Analyzing badge. Opens the result when done', kind: 'external' },
      { id: 'result', row: 1, col: 2, title: 'Result ready', sub: 'GET /scans/{id} until completed or failed', kind: 'primary' },
      { id: 'unknown', row: 1, col: 0, title: 'Unknown', sub: 'Calm explanation, retake guide and tips', kind: 'external' },
      { id: 'failed', row: 1, col: 1, title: 'Failed', sub: 'Reason in plain words. Retry reuses the stored image', kind: 'external' },
      { id: 'healthy', row: 2, col: 2, title: 'Healthy', sub: 'Reassuring panel with care tips for that plant' },
      { id: 'feedback', row: 2, col: 3, title: 'Was this result correct?', sub: 'Yes or No. On No: optional fix and comment', kind: 'external' },
      { id: 'disease', row: 1, col: 3, title: 'Disease found', sub: 'Panels: Result, Causes, Symptoms, Treatment, Prevention, Photos', kind: 'primary' },
    ],
    edges: [
      { from: 'scan', to: 'preview', label: 'pick photo' },
      { from: 'preview', to: 'progress', label: 'Analyze' },
      { from: 'progress', to: 'history', label: 'leave page', style: 'optional' },
      { from: 'progress', to: 'result', label: 'done' },
      { from: 'history', to: 'result', label: 'open', style: 'response', fromSide: 'bottom', toSide: 'top', toAt: 0.85 },
      { from: 'failed', to: 'progress', label: 'Retry', style: 'optional', fromSide: 'top', toSide: 'bottom', toAt: 0.15 },
      { from: 'result', to: 'unknown', label: 'unknown', fromSide: 'bottom', toSide: 'bottom', fromAt: 0.2 },
      { from: 'result', to: 'failed', label: 'failed' },
      { from: 'result', to: 'healthy', label: 'healthy', fromSide: 'bottom', toSide: 'top' },
      { from: 'result', to: 'disease', label: 'disease' },
      { from: 'healthy', to: 'feedback', label: 'rate', style: 'optional' },
      { from: 'disease', to: 'feedback', label: 'rate', style: 'optional', fromSide: 'bottom', toSide: 'top' },
      { from: 'unknown', to: 'scan', label: 'new photo', style: 'optional' },
    ],
    options: { gapX: 52, gapY: 46, maxNodeW: 165, ...FLOW_LAYOUT },
  }, ctx);
}
