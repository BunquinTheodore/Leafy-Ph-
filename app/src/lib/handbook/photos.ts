/** Plant photos pre cropped to 4:5 live in app/public/handbook/plants (source: api/app/seeds/plant_photos). */
export const PLANT_PHOTO_SLUGS: ReadonlySet<string> = new Set([
  "apple",
  "bell-pepper",
  "blueberry",
  "cherry",
  "corn",
  "grape",
  "orange",
  "peach",
  "potato",
  "soybean",
  "squash",
  "strawberry",
  "tomato",
]);

export function plantPhotoSrc(slug: string): string | null {
  return PLANT_PHOTO_SLUGS.has(slug) ? `/handbook/plants/${slug}.jpg` : null;
}
