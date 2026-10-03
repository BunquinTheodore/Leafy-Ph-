"use client";

import { Eye, EyeOff } from "lucide-react";
import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "placeholder"> {
  label: string;
  /** Helper text under the field. */
  hint?: ReactNode;
  /** Inline validation message; marks the field invalid. */
  error?: string;
  /** Adds a show/hide button for password fields. */
  revealable?: boolean;
}

/** Floating label input with inline validation and an optional show/hide control. */
export function Input({
  label,
  hint,
  error,
  revealable = false,
  type = "text",
  className,
  ...rest
}: InputProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const [revealed, setRevealed] = useState(false);
  const effectiveType = revealable && revealed ? "text" : type;
  const message = error ?? hint;

  return (
    <div className={className}>
      <div className="field">
        <input
          {...rest}
          id={id}
          type={effectiveType}
          placeholder=" "
          className="field__input"
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? messageId : undefined}
        />
        <label htmlFor={id} className="field__label">
          {label}
        </label>
        {revealable ? (
          <button
            type="button"
            className="btn btn-ghost btn-icon field__action"
            aria-label={revealed ? "Hide password" : "Show password"}
            aria-pressed={revealed}
            onClick={() => setRevealed((value) => !value)}
          >
            {revealed ? (
              <EyeOff size={20} strokeWidth={1.5} aria-hidden="true" />
            ) : (
              <Eye size={20} strokeWidth={1.5} aria-hidden="true" />
            )}
          </button>
        ) : null}
      </div>
      {message ? (
        <p
          id={messageId}
          className="field__message"
          data-tone={error ? "error" : undefined}
          role={error ? "alert" : undefined}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
