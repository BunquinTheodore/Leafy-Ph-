import type { SoundName } from "./mapping";

/** Master volume: about 25%. Every sound is synthesized, so there are no audio files. */
export const MASTER_VOLUME = 0.25;
const FLOOR = 0.0001;

interface Note {
  freq: number;
  /** Optional glide target in Hz. */
  to?: number;
  start: number;
  dur: number;
  type: OscillatorType;
  gain: number;
}

interface NoiseBurst {
  start: number;
  dur: number;
  /** Band pass center in Hz. */
  freq: number;
  gain: number;
}

export interface SoundDef {
  /** Total length in seconds (UI under 0.25, scan events under 0.6). */
  duration: number;
  /** Relative loudness 0..1 against the master volume. */
  level: number;
  notes: Note[];
  noise?: NoiseBurst;
}

/** Palette: a pentatonic family around A, soft sine and triangle voices, fast envelopes. */
export const SOUND_DEFS: Record<SoundName, SoundDef> = {
  click: {
    duration: 0.1,
    level: 0.7,
    notes: [{ freq: 520, to: 340, start: 0, dur: 0.09, type: "triangle", gain: 1 }],
  },
  hover: {
    duration: 0.05,
    level: 0.18,
    notes: [{ freq: 880, start: 0, dur: 0.04, type: "sine", gain: 1 }],
  },
  toggle: {
    duration: 0.16,
    level: 0.6,
    notes: [
      { freq: 392, start: 0, dur: 0.07, type: "sine", gain: 1 },
      { freq: 587, start: 0.06, dur: 0.09, type: "sine", gain: 0.9 },
    ],
  },
  panel: {
    duration: 0.22,
    level: 0.5,
    notes: [],
    noise: { start: 0, dur: 0.2, freq: 2400, gain: 1 },
  },
  success: {
    duration: 0.24,
    level: 0.75,
    notes: [
      { freq: 523, start: 0, dur: 0.11, type: "sine", gain: 1 },
      { freq: 784, start: 0.09, dur: 0.14, type: "sine", gain: 0.9 },
    ],
  },
  error: {
    duration: 0.22,
    level: 0.6,
    notes: [{ freq: 196, to: 130, start: 0, dur: 0.2, type: "sine", gain: 1 }],
  },
  delete: {
    duration: 0.14,
    level: 0.4,
    notes: [{ freq: 260, to: 180, start: 0, dur: 0.12, type: "triangle", gain: 1 }],
  },
  scanStart: {
    duration: 0.5,
    level: 0.55,
    notes: [{ freq: 330, to: 660, start: 0, dur: 0.46, type: "sine", gain: 1 }],
    noise: { start: 0, dur: 0.4, freq: 3200, gain: 0.35 },
  },
  scanDone: {
    duration: 0.55,
    level: 0.7,
    notes: [
      { freq: 523, start: 0, dur: 0.2, type: "sine", gain: 1 },
      { freq: 659, start: 0.13, dur: 0.2, type: "sine", gain: 0.9 },
      { freq: 988, start: 0.26, dur: 0.28, type: "sine", gain: 0.8 },
    ],
  },
};

function scheduleNote(ctx: AudioContext, note: Note, peak: number, origin: number): void {
  const start = origin + note.start;
  const end = start + note.dur;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = note.type;
  osc.frequency.setValueAtTime(note.freq, start);
  if (note.to) osc.frequency.exponentialRampToValueAtTime(note.to, end);
  gain.gain.setValueAtTime(FLOOR, start);
  gain.gain.linearRampToValueAtTime(peak * note.gain, start + Math.min(0.012, note.dur / 3));
  gain.gain.exponentialRampToValueAtTime(FLOOR, end);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(end + 0.02);
}

function scheduleNoise(ctx: AudioContext, burst: NoiseBurst, peak: number, origin: number): void {
  const length = Math.max(1, Math.floor(ctx.sampleRate * burst.dur));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = burst.freq;
  filter.Q.value = 0.8;
  const gain = ctx.createGain();
  const start = origin + burst.start;
  gain.gain.setValueAtTime(FLOOR, start);
  gain.gain.linearRampToValueAtTime(peak * burst.gain, start + burst.dur * 0.35);
  gain.gain.exponentialRampToValueAtTime(FLOOR, start + burst.dur);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start(start);
  source.stop(start + burst.dur + 0.02);
}

/** Plays one sound on the given context. `volume` (0..1) scales the master volume. */
export function playSound(ctx: AudioContext, name: SoundName, volume = 1): void {
  if (volume <= 0) return;
  const def = SOUND_DEFS[name];
  const peak = MASTER_VOLUME * Math.min(1, volume) * def.level;
  const origin = ctx.currentTime;
  for (const note of def.notes) scheduleNote(ctx, note, peak, origin);
  if (def.noise) scheduleNoise(ctx, def.noise, peak, origin);
}
