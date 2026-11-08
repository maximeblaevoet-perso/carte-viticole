import Link from "next/link";
import { WINE_REGIONS } from "@/data/regions";
import { YEARS } from "@/data/synthetic";

interface SelectsProps {
  regionId: string | null;
  year: number;
  onRegionChange: (regionId: string) => void;
  onYearChange: (year: number) => void;
  /** Distinct ids when the selects are rendered twice (header + mobile bar). */
  idSuffix?: string;
}

/** Region "search" + vintage selects, shared by the header and the mobile bar. */
export function RegionYearSelects({
  regionId,
  year,
  onRegionChange,
  onYearChange,
  idSuffix = "",
}: SelectsProps) {
  return (
    <>
        <label className="sr-only" htmlFor={`region-search${idSuffix}`}>
          Region
        </label>
        <select
          id={`region-search${idSuffix}`}
          value={regionId ?? ""}
          onChange={(e) => onRegionChange(e.target.value)}
          className="min-w-0 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
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

        <label className="sr-only" htmlFor={`year-select${idSuffix}`}>
          Millesime
        </label>
        <select
          id={`year-select${idSuffix}`}
          value={year}
          onChange={(e) => onYearChange(Number(e.target.value))}
          className="min-w-0 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
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

/**
 * Mobile only: the header is hidden on a phone (it hid the landscape), the
 * region and vintage move to a thin bar at the bottom of the map (ADR 0022).
 */
export function MobileRegionBar(props: SelectsProps) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-10 flex items-center gap-2 border-t border-slate-200 bg-white/95 px-3 py-1.5 md:hidden">
      <RegionYearSelects {...props} idSuffix="-mobile" />
    </div>
  );
}

/**
 * Top bar (desktop only): project name, region "search" (select), and vintage selection.
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
    <header className="z-10 hidden flex-wrap items-center gap-3 border-b md:flex border-slate-200 bg-white px-4 py-2.5">
      <Link href="/" className="flex items-center gap-2">
        <span className="inline-block h-3 w-3 rounded-full bg-wine-600" />
        <span className="text-sm font-semibold text-slate-900">
          Carte viticole
          <span className="ml-1 font-normal text-slate-400">· millesimes</span>
        </span>
      </Link>

      <div className="ml-auto flex items-center gap-2">
        <RegionYearSelects
          regionId={regionId}
          year={year}
          onRegionChange={onRegionChange}
          onYearChange={onYearChange}
        />
      </div>
    </header>
  );
}
