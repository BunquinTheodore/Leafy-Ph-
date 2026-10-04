/** Time the Undo toast stays open before the delete is sent. */
export const UNDO_WINDOW_MS = 6000;

export interface Deferred {
  /** Stops the action. Returns false when it already ran or was already cancelled. */
  cancel: () => boolean;
  /** Runs the action now (for example when the page is closing). */
  flush: () => void;
}

interface Timers {
  set: (callback: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
}

const REAL_TIMERS: Timers = {
  set: (callback, ms) => setTimeout(callback, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Runs `action` after `delayMs` unless cancelled. This is how delete with Undo works: nothing
 * reaches the API until the window ends, so Undo needs no server call.
 */
export function defer(
  action: () => void,
  delayMs: number = UNDO_WINDOW_MS,
  timers: Timers = REAL_TIMERS,
): Deferred {
  let state: "waiting" | "done" | "cancelled" = "waiting";
  const run = () => {
    if (state !== "waiting") return;
    state = "done";
    timers.clear(handle);
    action();
  };
  const handle: unknown = timers.set(run, delayMs);
  return {
    cancel: () => {
      if (state !== "waiting") return false;
      state = "cancelled";
      timers.clear(handle);
      return true;
    },
    flush: run,
  };
}
