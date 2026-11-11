import Link from "next/link";
import { YEARS } from "@/data/synthetic";
import { MobileSearch, SearchBar } from "@/components/SearchBar";
import type { SearchEntry, SearchIndex } from "@/lib/search";

type OnPick = (e: SearchEntry, index: SearchIndex) => void;

/** Vintage select, shared by the header and the mobile bar. */
function YearSelect({
  year,
  onYearChange,
  idSuffix = "",
}: {
  year: number;
  onYearChange: (year: number) => void;
  idSuffix?: string;
}) {
  return (
    <>
      <label className="sr-only" htmlFor={`year-select${idSuffix}`}>
        Millesime
      </label>
      <select
        id={`year-select${idSuffix}`}
        value={year}
        onChange={(e) => onYearChange(Number(e.target.value))}
        className="shrink-0 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
      >
        {YEARS.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </>
  );
}

interface BarProps {
  year: number;
  onYearChange: (year: number) => void;
  /** A search result was chosen (ADR 0023). */
  onPick: OnPick;
}

/**
 * Mobile only: the header is hidden on a phone (it hid the landscape), the
 * search and vintage move to a thin bar at the bottom of the map (ADR 0022,
 * ADR 0023). The search opens full screen so the keyboard never hides it.
 */
export function MobileRegionBar({ year, onYearChange, onPick }: BarProps) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-10 flex items-center gap-2 border-t border-slate-200 bg-white/95 px-3 py-1.5 md:hidden">
      <MobileSearch onPick={onPick} />
      <YearSelect year={year} onYearChange={onYearChange} idSuffix="-mobile" />
    </div>
  );
}

/**
 * Top bar (desktop only): project name, place search, and vintage selection.
 * Kept presentational; state is owned by the explorer.
 */
export function Header({ year, onYearChange, onPick }: BarProps) {
  return (
    <header className="z-20 hidden flex-wrap items-center gap-3 border-b md:flex border-slate-200 bg-white px-4 py-2.5">
      <Link href="/" className="flex items-center gap-2">
        <span className="inline-block h-3 w-3 rounded-full bg-wine-600" />
        <span className="text-sm font-semibold text-slate-900">
          Carte viticole
          <span className="ml-1 font-normal text-slate-400">· millesimes</span>
        </span>
      </Link>

      <div className="ml-auto flex items-center gap-2">
        <SearchBar onPick={onPick} />
        <YearSelect year={year} onYearChange={onYearChange} />
      </div>
    </header>
  );
}
