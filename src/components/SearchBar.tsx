"use client";

import { useEffect, useRef, useState } from "react";
import {
  SEARCH_TYPE_LABELS,
  loadSearchIndex,
  searchPlaces,
  type SearchEntry,
  type SearchIndex,
} from "@/lib/search";
import { REGION_COLORS } from "@/data/geo";
import { getRegion } from "@/data/regions";

const PLACEHOLDER = "Région, appellation, cru, lieu-dit…";

/** Chip colour per kind of place: the answer to « qu'est-ce que c'est ? ». */
const TYPE_STYLE: Record<string, string> = {
  region: "bg-wine-50 text-wine-700 ring-wine-200",
  subregion: "bg-wine-50 text-wine-700 ring-wine-200",
  zone: "bg-wine-50 text-wine-700 ring-wine-200",
  village: "bg-sky-50 text-sky-700 ring-sky-200",
  appellation: "bg-sky-50 text-sky-700 ring-sky-200",
  "grand-cru": "bg-amber-50 text-amber-800 ring-amber-300",
  "premier-cru": "bg-orange-50 text-orange-800 ring-orange-200",
  "lieu-dit": "bg-emerald-50 text-emerald-800 ring-emerald-200",
  commune: "bg-slate-100 text-slate-700 ring-slate-200",
  domaine: "bg-violet-50 text-violet-700 ring-violet-200",
};

function regionName(id: string | null): string | null {
  return id ? getRegion(id)?.name ?? null : null;
}

/** Shared search state: lazy index + results for the current query. */
function useSearch() {
  const [index, setIndex] = useState<SearchIndex | null>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const ensure = () => {
    if (!index) loadSearchIndex().then(setIndex);
  };
  const results = index ? searchPlaces(index, query) : [];
  const loading = !index && query.trim().length >= 2;
  useEffect(() => setActive(0), [query]);
  return { index, query, setQuery, results, loading, active, setActive, ensure };
}

function ResultList({
  results,
  active,
  loading,
  query,
  onPick,
  onHover,
}: {
  results: SearchEntry[];
  active: number;
  loading: boolean;
  query: string;
  onPick: (e: SearchEntry) => void;
  onHover?: (i: number) => void;
}) {
  if (loading) {
    return <p className="px-3 py-2.5 text-sm text-slate-400">Chargement…</p>;
  }
  if (query.trim().length >= 2 && results.length === 0) {
    return <p className="px-3 py-2.5 text-sm text-slate-400">Aucun résultat</p>;
  }
  return (
    <ul role="listbox">
      {results.map((e, i) => {
        const sub = [e.context, e.type !== "region" ? regionName(e.rootRegionId) : null]
          .filter((x, j, arr) => x && arr.indexOf(x) === j)
          .join(" · ");
        return (
          <li key={`${e.kind}-${e.id}`} role="option" aria-selected={i === active}>
            <button
              type="button"
              // mousedown: fires before the input blur closes the list.
              onMouseDown={(ev) => {
                ev.preventDefault();
                onPick(e);
              }}
              onMouseEnter={() => onHover?.(i)}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-left ${
                i === active ? "bg-slate-100" : ""
              }`}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: REGION_COLORS[e.rootRegionId ?? ""] ?? "#94a3b8" }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-slate-900">{e.name}</span>
                {sub && <span className="block truncate text-xs text-slate-500">{sub}</span>}
              </span>
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                  TYPE_STYLE[e.type] ?? "bg-slate-100 text-slate-700 ring-slate-200"
                }`}
              >
                {SEARCH_TYPE_LABELS[e.type] ?? e.type}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

const SearchIcon = () => (
  <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-slate-400" aria-hidden>
    <path
      fill="currentColor"
      d="M8.5 3a5.5 5.5 0 0 1 4.38 8.82l3.65 3.65a.75.75 0 1 1-1.06 1.06l-3.65-3.65A5.5 5.5 0 1 1 8.5 3Zm0 1.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"
    />
  </svg>
);

/** Desktop: input in the header with a drop-down list. */
export function SearchBar({ onPick }: { onPick: (e: SearchEntry, index: SearchIndex) => void }) {
  const s = useSearch();
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = (e: SearchEntry) => {
    if (!s.index) return;
    onPick(e, s.index);
    s.setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  };

  return (
    <div className="relative w-[340px]">
      <div className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 focus-within:border-wine-500 focus-within:ring-1 focus-within:ring-wine-500">
        <SearchIcon />
        <input
          ref={inputRef}
          type="search"
          value={s.query}
          placeholder={PLACEHOLDER}
          aria-label="Rechercher un lieu"
          onFocus={() => {
            s.ensure();
            setOpen(true);
          }}
          onBlur={() => setOpen(false)}
          onChange={(ev) => {
            s.setQuery(ev.target.value);
            setOpen(true);
          }}
          onKeyDown={(ev) => {
            if (ev.key === "ArrowDown") {
              ev.preventDefault();
              s.setActive(Math.min(s.active + 1, s.results.length - 1));
            } else if (ev.key === "ArrowUp") {
              ev.preventDefault();
              s.setActive(Math.max(s.active - 1, 0));
            } else if (ev.key === "Enter" && s.results[s.active]) {
              pick(s.results[s.active]);
            } else if (ev.key === "Escape") {
              s.setQuery("");
              inputRef.current?.blur();
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
        />
      </div>
      {open && s.query.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-[70vh] overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          <ResultList
            results={s.results}
            active={s.active}
            loading={s.loading}
            query={s.query}
            onPick={pick}
            onHover={s.setActive}
          />
        </div>
      )}
    </div>
  );
}

/** Mobile: a button in the bottom bar opening a full-screen search. */
export function MobileSearch({ onPick }: { onPick: (e: SearchEntry, index: SearchIndex) => void }) {
  const s = useSearch();
  const [open, setOpen] = useState(false);

  const close = () => {
    setOpen(false);
    s.setQuery("");
  };
  const pick = (e: SearchEntry) => {
    if (!s.index) return;
    onPick(e, s.index);
    close();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          s.ensure();
          setOpen(true);
        }}
        onTouchStart={s.ensure}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-left text-sm text-slate-400"
      >
        <SearchIcon />
        <span className="truncate">Rechercher un lieu</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
          <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
            <div className="flex flex-1 items-center gap-2 rounded-md border border-slate-300 px-2.5 py-2">
              <SearchIcon />
              <input
                autoFocus
                type="search"
                enterKeyHint="search"
                value={s.query}
                placeholder={PLACEHOLDER}
                aria-label="Rechercher un lieu"
                onChange={(ev) => s.setQuery(ev.target.value)}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter" && s.results[0]) pick(s.results[0]);
                }}
                // 16px: below that iOS zooms the page on focus.
                className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-slate-400"
              />
            </div>
            <button
              type="button"
              onClick={close}
              className="px-1 text-sm font-medium text-wine-700"
            >
              Annuler
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto py-1">
            {s.query.trim().length < 2 ? (
              <p className="px-3 py-2.5 text-sm text-slate-400">
                Une région, une appellation, un cru, un lieu-dit, une commune ou un domaine.
              </p>
            ) : (
              <ResultList
                results={s.results}
                active={-1}
                loading={s.loading}
                query={s.query}
                onPick={pick}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}
