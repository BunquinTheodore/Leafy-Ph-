import { Sun } from "lucide-react";
import { scanCopy } from "@/lib/i18n/scan-en";

const copy = scanCopy.tips;

/** How to take a good leaf photo. Short, four items, always visible beside the dropzone. */
export function TipCard() {
  return (
    <aside className="tips card card-glass" aria-labelledby="scan-tips-title">
      <h2 id="scan-tips-title" className="h3 tips__title">
        <Sun size={20} strokeWidth={1.5} aria-hidden="true" />
        {copy.title}
      </h2>
      <ul className="tips__list">
        {copy.items.map((tip) => (
          <li key={tip}>{tip}</li>
        ))}
      </ul>
    </aside>
  );
}
