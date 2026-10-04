import { defer, UNDO_WINDOW_MS, type Deferred } from "./deferred";

type Listener = () => void;

/** Deletes still inside the undo window. */
const waiting = new Map<string, Deferred>();
/** Everything the lists should hide: waiting, being deleted, and deleted this session. */
const hidden = new Set<string>();
const listeners = new Set<Listener>();
let snapshot: ReadonlySet<string> = new Set();

function publish(): void {
  snapshot = new Set(hidden);
  listeners.forEach((listener) => listener());
}

export function subscribeHidden(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Stable between changes, so it works as a useSyncExternalStore snapshot. */
export const hiddenSnapshot = (): ReadonlySet<string> => snapshot;

export const isHidden = (id: string): boolean => hidden.has(id);
export const isWaiting = (id: string): boolean => waiting.has(id);

/**
 * Hides a scan for the undo window, then runs the real delete. Lives outside React so the timer
 * survives navigating from the scan back to the list. If the delete fails the scan returns.
 */
export function scheduleDelete(
  id: string,
  run: () => Promise<boolean>,
  onFailed: () => void,
  delayMs: number = UNDO_WINDOW_MS,
): void {
  waiting.get(id)?.cancel();
  hidden.add(id);
  const action = defer(() => {
    waiting.delete(id);
    run()
      .then((ok) => {
        if (!ok) restore();
      })
      .catch(restore);
  }, delayMs);
  const restore = () => {
    hidden.delete(id);
    publish();
    onFailed();
  };
  waiting.set(id, action);
  publish();
}

/** Undo: the scan comes back and nothing was sent to the API. */
export function cancelDelete(id: string): boolean {
  const action = waiting.get(id);
  if (!action) return false;
  const cancelled = action.cancel();
  waiting.delete(id);
  hidden.delete(id);
  publish();
  return cancelled;
}

/** Runs every waiting delete now (the page is closing). */
export function flushPendingDeletes(): void {
  for (const action of [...waiting.values()]) action.flush();
}

export function resetPendingDeletesForTests(): void {
  waiting.clear();
  hidden.clear();
  publish();
}
