"use client";

import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ToastTone = "success" | "error" | "info";

export interface ToastInput {
  message: string;
  tone?: ToastTone;
  /** Optional action such as Undo. */
  action?: { label: string; onAction: () => void };
  /** Milliseconds before it closes itself. Defaults to 5000 (6000 with an action). */
  durationMs?: number;
}

interface ToastItem extends ToastInput {
  id: number;
}

const ToastContext = createContext<(toast: ToastInput) => void>(() => undefined);

export const useToast = () => useContext(ToastContext);

const ICONS = { success: CheckCircle2, error: TriangleAlert, info: Info } as const;

/** Toast region with polite announcements (assertive for errors). Success toasts confirm actions. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback(
    (id: number) => setItems((current) => current.filter((item) => item.id !== id)),
    [],
  );

  const push = useCallback(
    (input: ToastInput) => {
      counter.current += 1;
      const id = counter.current;
      setItems((current) => [...current.slice(-2), { ...input, id }]);
      window.setTimeout(() => dismiss(id), input.durationMs ?? (input.action ? 6000 : 5000));
    },
    [dismiss],
  );

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" role="region" aria-label="Notifications">
        {items.map((item) => {
          const tone = item.tone ?? "success";
          const Icon = ICONS[tone];
          return (
            <div
              key={item.id}
              className="toast"
              data-tone={tone}
              role={tone === "error" ? "alert" : "status"}
            >
              <Icon size={20} strokeWidth={1.5} aria-hidden="true" />
              <span className="flex-1">{item.message}</span>
              {item.action ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    item.action?.onAction();
                    dismiss(item.id);
                  }}
                >
                  {item.action.label}
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-ghost btn-sm btn-icon"
                aria-label="Dismiss"
                onClick={() => dismiss(item.id)}
              >
                <X size={16} strokeWidth={1.5} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
