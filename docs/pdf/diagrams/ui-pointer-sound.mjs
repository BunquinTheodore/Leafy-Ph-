// Pointer and sound pipeline: one listener for visuals, one delegated listener for sound.
import { layoutDiagram, PALETTE } from '../lib/diagram.mjs';

export default async function uiPointerSound(ctx) {
  return layoutDiagram({
    alt: 'Pointer and sound pipeline. The pointer move listener, throttled with requestAnimationFrame, writes CSS variables that components read. The pointerdown and pointerover listener maps the element to a sound, a gate applies the rules and rate limits, and the Web Audio synthesizer plays it.',
    lanes: [
      { id: 'vis', label: 'Visual reactions' },
      { id: 'snd', label: 'Sound' },
    ],
    nodes: [
      { id: 'move', lane: 'vis', col: 0, title: 'pointermove', sub: 'Passive, rAF throttled', kind: 'external' },
      { id: 'prov', lane: 'vis', col: 1, title: 'PointerProvider', sub: 'Writes the pointer position as CSS variables, for the viewport and per element', kind: 'primary' },
      { id: 'css', lane: 'vis', col: 2, title: 'CSS variables', sub: 'No React re-render per move', kind: 'store' },
      { id: 'comp', lane: 'vis', col: 3, title: 'Components', sub: 'Magnetic, TiltCard, ParallaxImage, SpotlightSurface, VeinLink' },
      { id: 'down', lane: 'snd', col: 0, title: 'pointerdown, pointerover', sub: 'One delegated listener on document', kind: 'external' },
      { id: 'map', lane: 'snd', col: 1, title: 'soundForTarget', sub: 'data-sfx or element type', kind: 'primary' },
      { id: 'gate', lane: 'snd', col: 2, title: 'Gate', sub: 'After first gesture, sound on, not hidden, rate limit, reduced motion' },
      { id: 'synth', lane: 'snd', col: 3, title: 'Web Audio synth', sub: 'Oscillators and filtered noise, about 25% volume', kind: 'store' },
      { id: 'silent', lane: 'snd', row: 1, col: 2, title: 'Silent', sub: 'Nothing plays', kind: 'terminal' },
    ],
    edges: [
      { from: 'move', to: 'prov', label: 'x, y' },
      { from: 'prov', to: 'css', label: 'write' },
      { from: 'css', to: 'comp', label: 'read' },
      { from: 'down', to: 'map', label: 'event' },
      { from: 'map', to: 'gate', label: 'name' },
      { from: 'gate', to: 'synth', label: 'allowed' },
      // the blocked path ends at a terminal node: it is a stop, not a return path
      { from: 'gate', to: 'silent', label: 'blocked', style: 'optional' },
    ],
    // Larger type, group captions and spacing so the figure fills the landscape page. The Silent box gets a dashed
    // outline (the dotted style stays reserved for the optional or blocked arrow), and the dotted arrow uses the
    // same green as the other arrows.
    options: {
      gapX: 40, gapY: 64, lanePad: 30, laneGap: 30, maxNodeW: 156, laneLabelMax: 96, avoidLaneEdges: true,
      fontSize: { title: 14.5, sub: 13, label: 13, lane: 14 },
      edgeStyles: { optional: { color: PALETTE.brand } },
      kindStyles: { terminal: { dash: '9 4', sw: 2.2, stroke: PALETTE.deep } },
    },
  }, ctx);
}
