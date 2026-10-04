/** Panel budget: at most six list items per panel on desktop, four on phones. */
export const ITEMS_DESKTOP = 6;
export const ITEMS_PHONE = 4;

export function chunkItems<T>(items: readonly T[], size: number): T[][] {
  const safe = Math.max(1, Math.floor(size));
  const pages: T[][] = [];
  for (let start = 0; start < items.length; start += safe) {
    pages.push(items.slice(start, start + safe));
  }
  return pages;
}

/** A readable confidence label from the model's text value, or null when there is none. */
export function confidenceLabel(raw: string | null): string | null {
  if (!raw) return null;
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  const percent = value <= 1 ? value * 100 : value;
  if (percent > 100) return null;
  return `${Math.round(percent)} percent`;
}

/**
 * Deterministic spot for the 3D marker, derived from the scan id. The model gives no location,
 * so this only keeps the marker steady between visits; the caption says it is not exact.
 */
export function markerSpot(id: string): { x: number; y: number } {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const unit = (shift: number) => ((hash >>> shift) & 0xff) / 255;
  return { x: (unit(0) - 0.5) * 0.9, y: (unit(8) - 0.5) * 0.9 };
}
