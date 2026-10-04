/** Client side checks before upload. The API repeats them; these just save a round trip. */
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const ACCEPT_ATTRIBUTE = ACCEPTED_TYPES.join(",");
export const MIN_SIDE_PX = 128;
export const MAX_PIXELS = 40_000_000;

export type FileProblem =
  "empty" | "type" | "too_large" | "too_small" | "too_many_pixels" | "unreadable";

export interface FileLike {
  type: string;
  size: number;
}

/** Type, emptiness and size. Returns null when the file passes. */
export function checkFile(file: FileLike): FileProblem | null {
  if (file.size <= 0) return "empty";
  if (!(ACCEPTED_TYPES as readonly string[]).includes(file.type)) return "type";
  if (file.size > MAX_FILE_BYTES) return "too_large";
  return null;
}

export function checkDimensions(width: number, height: number): FileProblem | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return "unreadable";
  }
  if (Math.min(width, height) < MIN_SIDE_PX) return "too_small";
  if (width * height > MAX_PIXELS) return "too_many_pixels";
  return null;
}

/** Reads the pixel size of an image file in the browser. Resolves null if it cannot be decoded. */
export function readDimensions(file: Blob): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    const done = (value: { width: number; height: number } | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    image.onload = () => done({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => done(null);
    image.src = url;
  });
}

export const FILE_PROBLEM_MESSAGES: Readonly<Record<FileProblem, string>> = {
  empty: "That file is empty. Choose a photo and try again.",
  type: "That file type is not supported. Use a JPEG, PNG or WebP photo.",
  too_large: "That photo is larger than 8 MB. Choose a smaller one or take a new photo.",
  too_small: "That photo is too small to read. Use a photo at least 128 pixels wide and tall.",
  too_many_pixels: "That photo has too many pixels. Choose a smaller version of it.",
  unreadable: "We could not open that photo. Try a different one.",
};
