import { severityLevel } from "@/lib/handbook/severity";
import { Badge, SEVERITY_LABELS } from "../ui/Display";

/** Severity with an icon and a word, never color alone. Renders nothing when no level is known. */
export function SeverityBadge({
  severity,
  withPrefix = true,
}: {
  severity: string | null;
  withPrefix?: boolean;
}) {
  const level = severityLevel(severity);
  if (!level) return null;
  const label = SEVERITY_LABELS[level];
  return <Badge tone={level}>{withPrefix ? `Severity: ${label}` : label}</Badge>;
}
