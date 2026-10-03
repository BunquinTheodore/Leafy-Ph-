/** Pure helpers behind the cursor reactive primitives, kept free of DOM so they are unit tested. */

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Pointer position inside an element as 0..1 fractions (clamped). Center for empty rects. */
export function pointerFraction(
  clientX: number,
  clientY: number,
  rect: RectLike,
): { x: number; y: number } {
  if (rect.width <= 0 || rect.height <= 0) return { x: 0.5, y: 0.5 };
  return {
    x: clamp((clientX - rect.left) / rect.width, 0, 1),
    y: clamp((clientY - rect.top) / rect.height, 0, 1),
  };
}

export interface MagneticOptions {
  /** Pull starts inside this distance (px) from the element center. */
  radius: number;
  /** How much of the offset becomes drift. */
  strength: number;
  /** Maximum drift in px. */
  max: number;
}

/** Soft pull toward the pointer, saturating smoothly at `max` and zero outside `radius`. */
export function magneticOffset(
  dx: number,
  dy: number,
  options: MagneticOptions,
): { x: number; y: number } {
  if (Math.hypot(dx, dy) > options.radius) return { x: 0, y: 0 };
  const soft = (delta: number) => options.max * Math.tanh((delta * options.strength) / options.max);
  return { x: soft(dx), y: soft(dy) };
}

/** Frame rate independent exponential smoothing toward a target. */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

/** Centered pixel shift for a 0..1 fraction. */
export const shift = (fraction: number, amountPx: number): number => (fraction - 0.5) * amountPx;

export interface EffectGate {
  finePointer: boolean;
  reducedMotion: boolean;
  effectsOff: boolean;
}

/** Decorative effects run only for a real mouse, with motion allowed and effects not disabled. */
export const effectsAllowed = (gate: EffectGate): boolean =>
  gate.finePointer && !gate.reducedMotion && !gate.effectsOff;
