import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Info,
  Leaf,
  ShieldCheck,
  Sprout,
  type LucideIcon,
} from "lucide-react";
import type { ComponentProps, HTMLAttributes, ReactNode } from "react";
import { TiltCard } from "../interaction/Surfaces";

const cx = (...parts: Array<string | false | undefined>) => parts.filter(Boolean).join(" ");

/* ---- Card ---- */
interface CardProps extends HTMLAttributes<HTMLDivElement> {
  glass?: boolean;
  panel?: boolean;
  vein?: boolean;
  /** Tilt toward the cursor with a glare (cards for plants, diseases, scans, stats). */
  tilt?: boolean;
  hint?: string;
}

export function Card({
  glass,
  panel,
  vein = true,
  tilt,
  hint,
  className,
  children,
  ...rest
}: CardProps) {
  const classNames = cx(
    "card",
    glass && "card-glass",
    panel && "card-panel",
    vein && "card-vein",
    className,
  );
  if (tilt) {
    return (
      <TiltCard className={classNames} hint={hint}>
        {children}
      </TiltCard>
    );
  }
  return (
    <div {...rest} className={classNames}>
      {children}
    </div>
  );
}

/* ---- Badge (severity is never color only: icon plus label) ---- */
export type BadgeTone = "healthy" | "low" | "moderate" | "high" | "severe" | "info";

const BADGE_ICONS: Record<BadgeTone, LucideIcon> = {
  healthy: ShieldCheck,
  low: Sprout,
  moderate: Leaf,
  high: AlertTriangle,
  severe: AlertOctagon,
  info: Info,
};

export const SEVERITY_LABELS: Record<Exclude<BadgeTone, "info">, string> = {
  healthy: "Healthy",
  low: "Low",
  moderate: "Moderate",
  high: "High",
  severe: "Severe",
};

export function Badge({ tone = "info", children }: { tone?: BadgeTone; children?: ReactNode }) {
  const Icon = BADGE_ICONS[tone];
  const label = children ?? (tone === "info" ? null : SEVERITY_LABELS[tone]);
  return (
    <span className="badge" data-tone={tone}>
      <Icon size={14} strokeWidth={1.5} aria-hidden="true" />
      {label}
    </span>
  );
}

/* ---- Alert ---- */
export type AlertTone = "info" | "success" | "warning" | "error";

const ALERT_ICONS: Record<AlertTone, LucideIcon> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertOctagon,
};

interface AlertProps {
  tone?: AlertTone;
  title?: string;
  children: ReactNode;
  className?: string;
}

/** Errors use role=alert; everything else is a polite status. Say what happened and what to do next. */
export function Alert({ tone = "info", title, children, className }: AlertProps) {
  const Icon = ALERT_ICONS[tone];
  return (
    <div
      className={cx("alert", className)}
      data-tone={tone}
      role={tone === "error" ? "alert" : "status"}
    >
      <Icon size={20} strokeWidth={1.5} aria-hidden="true" />
      <div>
        {title ? (
          <p className="m-0 font-[family-name:var(--font-heading)] font-semibold">{title}</p>
        ) : null}
        <div>{children}</div>
      </div>
    </div>
  );
}

/* ---- Skeleton ---- */
export function Skeleton({
  className,
  style,
}: Pick<ComponentProps<"span">, "className" | "style">) {
  return <span aria-hidden="true" className={cx("skeleton", className)} style={style} />;
}

/* ---- EmptyState: calm, with one next action ---- */
export function EmptyState({
  icon: Icon = Leaf,
  title,
  children,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <Icon className="empty__icon" size={40} strokeWidth={1.5} aria-hidden="true" />
      <h3 className="h3">{title}</h3>
      {children ? <p className="blurb m-0">{children}</p> : null}
      {action}
    </div>
  );
}
