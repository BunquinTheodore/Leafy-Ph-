import { member } from "@/lib/i18n/member-en";
import { Card } from "../ui/Display";
import type { TopDisease } from "./data";

const copy = member.dashboard;

/** Top five diseases found in the member's scans, with a proportional bar and the count. */
export function TopDiseases({ diseases }: { diseases: readonly TopDisease[] }) {
  const max = Math.max(1, ...diseases.map((row) => row.count));
  return (
    <Card glass className="top" data-testid="top-diseases">
      <h2 className="h3 top__title">{copy.topTitle}</h2>
      {diseases.length === 0 ? (
        <p className="blurb m-0">{copy.topEmpty}</p>
      ) : (
        <ol className="top__list">
          {diseases.map((row, index) => (
            <li key={`${row.plantName ?? ""}-${row.name}`} className="top__row">
              <span className="top__rank stat" aria-hidden="true">
                {index + 1}
              </span>
              <span className="top__text">
                <span className="title-line top__name">{row.name}</span>
                {row.plantName ? (
                  <span className="title-line top__plant">{row.plantName}</span>
                ) : null}
              </span>
              <span className="top__bar" aria-hidden="true">
                <span style={{ width: `${Math.round((row.count / max) * 100)}%` }} />
              </span>
              <span className="stat top__count">
                {row.count}
                <span className="sr-only"> {row.count === 1 ? "scan" : "scans"}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
