import { Check } from "lucide-react";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

interface ProgressProps {
  /** 0..100. Omit for an indeterminate bar. */
  value?: number;
  /** Accessible name, e.g. "Uploading photo". */
  label: string;
  /** Human readable value for screen readers, e.g. "Analyzing leaf". */
  valueText?: string;
  className?: string;
}

/** Progress bar with role=progressbar. Honest: pass a real value, or leave it indeterminate. */
export function Progress({ value, label, valueText, className }: ProgressProps) {
  const determinate = typeof value === "number";
  const now = determinate ? Math.round(clamp(value, 0, 100)) : undefined;
  return (
    <div
      className={["progress", className ?? ""].filter(Boolean).join(" ")}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={now}
      aria-valuetext={valueText}
      data-indeterminate={determinate ? undefined : "true"}
    >
      <div className="progress__bar" style={determinate ? { width: `${now}%` } : undefined} />
    </div>
  );
}

export interface Step {
  id: string;
  label: string;
}

/** Ordered steps with the current one marked (aria-current="step"). */
export function Stepper({
  steps,
  current,
  label,
}: {
  steps: Step[];
  current: string;
  label: string;
}) {
  const currentIndex = steps.findIndex((step) => step.id === current);
  return (
    <ol className="stepper" aria-label={label}>
      {steps.map((step, index) => {
        const state = index < currentIndex ? "done" : index === currentIndex ? "current" : "todo";
        return (
          <li
            key={step.id}
            className="stepper__item"
            data-state={state}
            aria-current={state === "current" ? "step" : undefined}
          >
            <span className="stepper__rule" aria-hidden="true" />
            <span className="inline-flex items-center gap-1">
              {state === "done" ? <Check size={14} strokeWidth={2} aria-hidden="true" /> : null}
              {step.label}
              {state === "done" ? <span className="sr-only"> (done)</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
