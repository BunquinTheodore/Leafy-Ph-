"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Buttons row, e.g. Cancel and a destructive confirm. */
  actions?: ReactNode;
}

/** Modal built on the native <dialog>: focus trap, Escape and inert background come for free. */
export function Dialog({ open, onClose, title, children, actions }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <h2 id={titleId} className="h3 mb-3">
        {title}
      </h2>
      <div className="prose">{children}</div>
      {actions ? <div className="mt-6 flex flex-wrap justify-end gap-3">{actions}</div> : null}
    </dialog>
  );
}
