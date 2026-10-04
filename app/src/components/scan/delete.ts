"use client";

import { deleteScan } from "@/lib/scans/api";
import { UNDO_WINDOW_MS } from "@/lib/scans/deferred";
import { cancelDelete, flushPendingDeletes, scheduleDelete } from "@/lib/scans/pending-deletes";
import { scanCopy } from "@/lib/i18n/scan-en";
import type { ToastInput } from "../ui/Toast";

const copy = scanCopy.result;
let leaveHookInstalled = false;

/** A delete that is still waiting must not be lost when the tab closes. */
function installLeaveFlush(): void {
  if (leaveHookInstalled || typeof window === "undefined") return;
  leaveHookInstalled = true;
  window.addEventListener("pagehide", flushPendingDeletes);
}

interface DeleteOptions {
  id: string;
  toast: (toast: ToastInput) => void;
  playDelete?: () => void;
  /** Called when Undo brings the scan back. */
  onRestored?: () => void;
}

/**
 * Delete with Undo: the scan disappears from lists at once, a toast offers Undo for about six
 * seconds, and only then is the delete sent. Undo therefore never needs the server.
 */
export function deleteWithUndo({ id, toast, playDelete, onRestored }: DeleteOptions): void {
  installLeaveFlush();
  playDelete?.();
  scheduleDelete(
    id,
    () => deleteScan(id),
    () => toast({ message: copy.deleteFailed, tone: "error" }),
  );
  toast({
    message: copy.deleted,
    tone: "info",
    durationMs: UNDO_WINDOW_MS,
    action: {
      label: copy.undo,
      onAction: () => {
        if (cancelDelete(id)) {
          toast({ message: copy.restored, tone: "success" });
          onRestored?.();
        }
      },
    },
  });
}
