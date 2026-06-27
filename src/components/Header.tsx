import Link from "next/link";
import { WINE_REGIONS } from "@/data/regions";
import { YEARS } from "@/data/synthetic";

/**
 * Top bar: project name, region "search" (select), and vintage selection.
 * Kept presentational; state is owned by the explorer.
 */
export function Header({
  regionId,
  year,
  onRegionChange,
  onYearChange,
}: {
  regionId: string | null;
  year: number;
  onRegionChange: (regionId: string) => void;
  onYearChange: (year: number) => void;
}) {
  return (
    <header className="z-10 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
      <Link href="/" className="flex items-center gap-2">
        <span className="inline-block h-3 w-3 rounded-full bg-wine-600" />
        <span className="text-sm font-semibold text-slate-900">
          Carte viticole
          <span className="ml-1 font-normal text-slate-400">· millesimes</span>
        </span>
      </Link>

      <div className="ml-auto flex items-center gap-2">
        <label className="sr-only" htmlFor="region-search">
          Region
        </label>
        <select
          id="region-search"
          value={regionId ?? ""}
          onChange={(e) => onRegionChange(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
        >
          <option value="" disabled>
            Rechercher une region
          </option>
          {WINE_REGIONS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor="year-select">
          Millesime
        </label>
        <select
          id="year-select"
          value={year}
          onChange={(e) => onYearChange(Number(e.target.value))}
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
        >
          {YEARS.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
    </header>
  );
}
