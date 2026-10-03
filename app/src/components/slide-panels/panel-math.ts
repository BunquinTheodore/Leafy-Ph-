import { clamp } from "../interaction/math";

/** Panel index for a scroll position (nearest snap point). */
export function indexForScroll(scrollLeft: number, width: number, count: number): number {
  if (width <= 0 || count <= 0) return 0;
  return clamp(Math.round(scrollLeft / width), 0, count - 1);
}

/** Panel index for a location hash such as "#treatment", or null when it matches nothing. */
export function indexForHash(hash: string, ids: readonly string[]): number | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return null;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const index = ids.indexOf(decoded);
  return index === -1 ? null : index;
}
