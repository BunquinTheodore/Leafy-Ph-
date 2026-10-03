import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import { Magnetic } from "../interaction/Magnetic";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

interface Shared {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Magnetic pull toward the cursor (real mouse only). Defaults to on for primary buttons. */
  magnetic?: boolean;
  children: ReactNode;
}

const classes = (variant: ButtonVariant, size: ButtonSize, extra?: string) =>
  ["btn", `btn-${variant}`, size === "md" ? "" : `btn-${size}`, "pressable", extra ?? ""]
    .filter(Boolean)
    .join(" ");

function wrap(content: ReactNode, magnetic: boolean) {
  return magnetic ? <Magnetic>{content}</Magnetic> : content;
}

type ButtonProps = Shared &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
    /** Shows a spinner, sets aria-busy and blocks double submits. */
    loading?: boolean;
  };

export function Button({
  variant = "primary",
  size = "md",
  magnetic = variant === "primary",
  loading = false,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return wrap(
    <button
      {...rest}
      type={type}
      className={classes(variant, size, className)}
      data-pointer-surface
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? <span className="btn-spinner" aria-hidden="true" /> : null}
      {children}
    </button>,
    magnetic && !disabled && !loading,
  );
}

type LinkButtonProps = Shared & Omit<ComponentProps<typeof Link>, "children">;

/** Same look as Button, rendered as a link (navigation, never an action). */
export function LinkButton({
  variant = "primary",
  size = "md",
  magnetic = variant === "primary",
  className,
  children,
  ...rest
}: LinkButtonProps) {
  return wrap(
    <Link {...rest} className={classes(variant, size, className)} data-pointer-surface>
      {children}
    </Link>,
    magnetic,
  );
}
