import { getCatalog } from "../handbook/catalog";
import { buildLabelOptions, type LabelOptions } from "./labels";

/** Server only. The catalog fetches are cached (revalidate one hour). */
export async function loadLabelOptions(): Promise<LabelOptions> {
  const catalog = await getCatalog();
  const [plants, diseases] = await Promise.all([catalog.plants(), catalog.diseases()]);
  return buildLabelOptions(plants, diseases);
}

/** Same data for server rendered pages: a catalog outage returns null instead of failing the page. */
export async function loadLabelOptionsOrNull(): Promise<LabelOptions | null> {
  try {
    return await loadLabelOptions();
  } catch {
    return null;
  }
}
