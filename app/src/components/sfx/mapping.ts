export type SoundName =
  | "click"
  | "hover"
  | "toggle"
  | "panel"
  | "success"
  | "error"
  | "delete"
  | "scanStart"
  | "scanDone";

const SOUND_NAMES: ReadonlySet<string> = new Set<SoundName>([
  "click",
  "hover",
  "toggle",
  "panel",
  "success",
  "error",
  "delete",
  "scanStart",
  "scanDone",
]);

const INTERACTIVE =
  '[data-sfx], button, a[href], [role="button"], [role="tab"], [role="switch"], summary';
const HOVERABLE = ".btn-primary, [data-sfx-hover]";

function isDisabled(element: Element): boolean {
  return element.matches(":disabled") || element.getAttribute("aria-disabled") === "true";
}

/** Maps an event target to a sound. Components override with data-sfx; "none" opts out. */
export function soundForTarget(
  target: Element | null,
  type: "pointerdown" | "pointerover",
): SoundName | null {
  const element = target?.closest(INTERACTIVE);
  if (!element || isDisabled(element)) return null;
  const declared = element.getAttribute("data-sfx");
  if (declared === "none") return null;

  if (type === "pointerover") {
    return element.matches(HOVERABLE) || declared === "hover" ? "hover" : null;
  }
  if (declared && declared !== "hover" && SOUND_NAMES.has(declared)) return declared as SoundName;
  return element.getAttribute("role") === "switch" ? "toggle" : "click";
}

const MIN_INTERVAL_MS: Record<SoundName, number> = {
  click: 60,
  hover: 300,
  toggle: 80,
  panel: 160,
  success: 400,
  error: 400,
  delete: 200,
  scanStart: 800,
  scanDone: 800,
};

const BURST_WINDOW_MS = 250;
const BURST_LIMIT = 4;

/** Rate limits sounds per name and across all names so rapid clicks never stack. */
export class SfxGate {
  private readonly last = new Map<SoundName, number>();
  private recent: number[] = [];

  allow(name: SoundName, nowMs: number): boolean {
    const previous = this.last.get(name);
    if (previous !== undefined && nowMs - previous < MIN_INTERVAL_MS[name]) return false;
    this.recent = this.recent.filter((time) => nowMs - time < BURST_WINDOW_MS);
    if (this.recent.length >= BURST_LIMIT) return false;
    this.last.set(name, nowMs);
    this.recent.push(nowMs);
    return true;
  }
}
