import type { StepId } from "@/lib/scans/stages";

export interface BeamParams {
  /** Sweeps per second. 0 parks the beam. */
  speed: number;
  /** 0 hides the beam, 1 is full strength. */
  intensity: number;
  /** Share of the particle field that is visible, 0 to 1. */
  particles: number;
}

/** The beam follows the stage: parked while uploading, busiest while analyzing, gone when done. */
export function beamParams(step: StepId): BeamParams {
  switch (step) {
    case "uploading":
      return { speed: 0, intensity: 0.25, particles: 0 };
    case "checking":
      return { speed: 0.35, intensity: 0.6, particles: 0.1 };
    case "analyzing":
      return { speed: 0.7, intensity: 1, particles: 1 };
    case "saving":
      return { speed: 0.3, intensity: 0.55, particles: 0.2 };
    case "done":
      return { speed: 0, intensity: 0, particles: 0 };
  }
}

/** Triangle wave: 0 to 1 and back. Smoother for the eye than a sawtooth. */
export function sweepPosition(seconds: number, speed: number): number {
  if (speed === 0) return 0;
  const phase = (seconds * speed) % 1;
  return phase < 0.5 ? phase * 2 : (1 - phase) * 2;
}

/** Moves a value toward a target at a damped rate, so parameter changes glide. */
export function damp(current: number, target: number, lambda: number, delta: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * delta));
}
