export const RESEND_COOLDOWN_SECONDS = 60;
const MAX_COOLDOWN_SECONDS = 3600;

/** Timestamp (ms) at which a cooldown that starts now ends. Caps server supplied waits. */
export function cooldownDeadline(nowMs: number, seconds: number): number {
  const safe = Math.min(Math.max(0, Math.floor(seconds)), MAX_COOLDOWN_SECONDS);
  return nowMs + safe * 1000;
}

/** Whole seconds left, rounded up so a running cooldown never reads 0. */
export function secondsRemaining(deadlineMs: number | null, nowMs: number): number {
  if (deadlineMs === null || !Number.isFinite(deadlineMs)) return 0;
  return Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000));
}
