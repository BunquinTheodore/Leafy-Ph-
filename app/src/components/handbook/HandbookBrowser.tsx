"use client";

import { Search, X } from "lucide-react";
import { useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { handbookCopy } from "@/lib/handbook/copy";
import type { ViewportSize } from "@/lib/handbook/device";
import { searchCatalog, type SearchEntry } from "@/lib/handbook/search";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/Display";
import { CatalogRail } from "./CatalogRail";

const MAX_QUERY_LENGTH = 100;

function writeQuery(value: string) {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set("q", value);
  else url.searchParams.delete("q");
  window.history.replaceState(window.history.state, "", url);
}

/** Search across plants and diseases. Results replace the plant carousel and page sideways. */
export function HandbookBrowser({
  index,
  initialQuery = "",
  initialSize = "desktop",
}: {
  index: SearchEntry[];
  initialQuery?: string;
  initialSize?: ViewportSize;
}) {
  const copy = handbookCopy.index;
  const [query, setQuery] = useState(initialQuery.slice(0, MAX_QUERY_LENGTH));
  const input = useRef<HTMLInputElement>(null);
  const trimmed = query.trim();

  const plants = useMemo(() => index.filter((entry) => entry.kind === "plant"), [index]);
  const results = useMemo(() => (trimmed ? searchCatalog(index, trimmed) : []), [index, trimmed]);

  const update = (value: string) => {
    const next = value.slice(0, MAX_QUERY_LENGTH);
    setQuery(next);
    writeQuery(next.trim());
  };

  const clear = () => {
    update("");
    input.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape" && query) {
      event.preventDefault();
      event.stopPropagation();
      clear();
    }
  };

  return (
    <>
      <div className="hb__head">
        <div className="hb__titles">
          <p className="eyebrow m-0">{copy.eyebrow}</p>
          <h1 className="display hb__title">{copy.title}</h1>
          <p className="hb__lede">{copy.lede}</p>
        </div>
        <div className="hb-search" role="search">
          <label htmlFor="hb-search-input" className="sr-only">
            {copy.searchLabel}
          </label>
          <Search size={20} strokeWidth={1.5} aria-hidden="true" />
          <input
            id="hb-search-input"
            ref={input}
            type="search"
            name="q"
            value={query}
            maxLength={MAX_QUERY_LENGTH}
            placeholder={copy.searchPlaceholder}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            onChange={(event: ChangeEvent<HTMLInputElement>) => update(event.target.value)}
            onKeyDown={onKeyDown}
          />
          {query ? (
            <button
              type="button"
              className="hb-search__clear pressable"
              aria-label={copy.clearSearch}
              onClick={clear}
            >
              <X size={18} strokeWidth={1.5} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {trimmed ? (results.length === 0 ? copy.noMatchTitle : `${results.length} results`) : ""}
      </p>
      {trimmed === "" ? (
        <CatalogRail
          key="plants"
          entries={plants}
          variant="plants"
          label={copy.railLabel}
          idPrefix="plants"
          initialSize={initialSize}
        />
      ) : results.length > 0 ? (
        <CatalogRail
          key={`results:${trimmed}`}
          entries={results}
          variant="compact"
          label={copy.resultsLabel}
          idPrefix="result"
          initialSize={initialSize}
        />
      ) : (
        <div className="grid flex-1 place-items-center px-4">
          <EmptyState
            title={copy.noMatchTitle}
            action={
              <Button variant="secondary" onClick={clear}>
                {copy.clearSearch}
              </Button>
            }
          >
            {copy.noMatchBody}
          </EmptyState>
        </div>
      )}
    </>
  );
}
