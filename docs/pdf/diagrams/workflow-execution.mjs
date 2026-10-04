// Execution workflow: waves, agents and gates. Built boxes are filled and say BUILT in the text.
import { layoutDiagram } from '../lib/diagram.mjs';

export default async function workflowExecution(ctx) {
  return layoutDiagram({
    alt: 'Execution workflow flow chart. Step 0 and wave 0 (preflight and contracts, built) feed wave 1 with three parallel agents: A backend core, B data, C frontend foundation (built). All three feed Gate 1. Gate 1 feeds wave 2 with agent D scans API and agent E scan screens (built). Both feed integration and gate 2. Gate 2 feeds wave 3: performance (open, waits for hosting), E2E and layout checks (built), and docs (built). These feed the final gate, which waits for the ML model and hosting.',
    nodes: [
      { id: 's0', col: 1, row: 0, title: 'Step 0 and wave 0', sub: 'BUILT. Preflight, then contracts', kind: 'built' },
      { id: 'a', col: 0, row: 1, title: 'Agent A: api/', sub: 'BUILT. Phases 3 to 8: core, auth, Google, account', kind: 'built' },
      { id: 'b', col: 1, row: 1, title: 'Agent B: data', sub: 'BUILT. Phases 2 and 4: seed data, labels.json for A', kind: 'built' },
      { id: 'c', col: 2, row: 1, title: 'Agent C: app/', sub: 'BUILT. Phases 11 and 12: web, brand, hero', kind: 'built' },
      { id: 'g1', col: 1, row: 2, title: 'Gate 1', sub: 'Tests, coverage, migrations, seeds, reviewers' },
      { id: 'd', col: 0, row: 3, title: 'Agent D: api/', kind: 'built', sub: 'BUILT. Phases 9 and 10: storage, ML stub, scans' },
      { id: 'e', col: 2, row: 3, title: 'Agent E: app/', kind: 'built', sub: 'BUILT. Phase 13: scan screens, 3D scenes' },
      { id: 'g2', col: 1, row: 4, title: 'Integration and gate 2', sub: 'Real API, browser pass, security review', kind: 'built' },
      { id: 'perf', col: 0, row: 5, title: 'Performance', sub: 'OPEN. Phase 14: Lighthouse, needs a host', kind: 'next' },
      { id: 'e2e', col: 1, row: 5, title: 'E2E and layout', sub: 'BUILT. Phase 15: Playwright', kind: 'built' },
      { id: 'docs', col: 2, row: 5, title: 'Docs', sub: 'BUILT. README, ML guide', kind: 'built' },
      { id: 'fin', col: 1, row: 6, title: 'Final gate', sub: 'Waits for ML model and host', kind: 'final' },
    ],
    edges: [
      { from: 's0', to: 'a', fromSide: 'bottom', toSide: 'top' },
      { from: 's0', to: 'b', fromSide: 'bottom', toSide: 'top' },
      { from: 's0', to: 'c', fromSide: 'bottom', toSide: 'top' },
      { from: 'a', to: 'g1', fromSide: 'bottom', toSide: 'left' },
      { from: 'b', to: 'g1', fromSide: 'bottom', toSide: 'top' },
      { from: 'c', to: 'g1', fromSide: 'bottom', toSide: 'right' },
      { from: 'g1', to: 'd', fromSide: 'bottom', toSide: 'top' },
      { from: 'g1', to: 'e', fromSide: 'bottom', toSide: 'top' },
      { from: 'd', to: 'g2', fromSide: 'bottom', toSide: 'left' },
      { from: 'e', to: 'g2', fromSide: 'bottom', toSide: 'right' },
      { from: 'g2', to: 'perf', fromSide: 'bottom', toSide: 'top' },
      { from: 'g2', to: 'e2e', fromSide: 'bottom', toSide: 'top' },
      { from: 'g2', to: 'docs', fromSide: 'bottom', toSide: 'top' },
      { from: 'perf', to: 'fin', fromSide: 'bottom', toSide: 'left' },
      { from: 'e2e', to: 'fin', fromSide: 'bottom', toSide: 'top' },
      { from: 'docs', to: 'fin', fromSide: 'bottom', toSide: 'right' },
    ],
    options: { kindStyles: { next: { fill: '#ffffff', stroke: '#2b3a31', sw: 2.6 } }, gapX: 24, gapY: 32, outerY: 22, maxNodeW: 184, minNodeW: 150 },
  }, ctx);
}
