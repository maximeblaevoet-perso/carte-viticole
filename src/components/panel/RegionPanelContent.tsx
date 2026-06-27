"use client";

import Link from "next/link";
import { useMemo } from "react";
import { getRegion } from "@/data/regions";
import { getRegionVintages, getVintage } from "@/data/synthetic";
import { FlagChips } from "@/components/FlagChips";
import { KeyIndicators } from "@/components/KeyIndicators";
import { SourceBadge } from "@/components/SourceBadge";
import { VintageTimeline } from "@/components/VintageTimeline";
import { MonthlyClimateChart } from "@/components/charts/MonthlyClimateChart";

/**
 * Shared panel body used by both the desktop side panel and the mobile bottom
 * sheet. Shows the selected region + vintage profile, indicators, a monthly
 * chart, the vintage timeline, and detail/compare actions.
 */
export function RegionPanelContent({
  regionId,
  year,
  onYearChange,
}: {
  regionId: string | null;
  year: number;
  onYearChange: (year: number) => void;
}) {
  const region = regionId ? getRegion(regionId) : undefined;
  const vintage = regionId ? getVintage(regionId, year) : undefined;

  // Per-year warmth intensities for the timeline tint.
  const intensities = useMemo(() => {
    if (!regionId) return undefined;
    const vintages = getRegionVintages(regionId);
    const temps = vintages.map((v) => v.indicators.growingSeasonTempC);
    const min = Math.min(...temps);
    const max = Math.max(...temps);
    const span = max - min || 1;
    return Object.fromEntries(
      vintages.map((v) => [
        v.year,
        (v.indicators.growingSeasonTempC - min) / span,
      ])
    ) as Record<number, number>;
  }, [regionId]);

  if (!region || !vintage) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <p className="text-sm text-slate-500">
          Selectionnez une region sur la carte pour explorer ses millesimes.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <div>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {region.name}
            </h2>
            <p className="text-xs text-slate-500">{region.macroArea}</p>
          </div>
          <span className="rounded-md bg-wine-600 px-2.5 py-1 text-sm font-semibold text-white">
            {year}
          </span>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-600">
          {region.blurb}
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="mb-1.5 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Profil du millesime
          </h3>
          <SourceBadge
            sourceType={vintage.sourceType}
            confidence={vintage.confidence}
          />
        </div>
        <p className="text-sm leading-relaxed text-slate-700">
          {vintage.summary}
        </p>
        <div className="mt-2.5">
          <FlagChips flags={vintage.flags} />
        </div>
      </div>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Indicateurs cles
        </h3>
        <KeyIndicators indicators={vintage.indicators} />
      </section>

      <section>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Climat mensuel
        </h3>
        <MonthlyClimateChart monthly={vintage.monthly} height={200} />
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Millesimes
        </h3>
        <VintageTimeline
          year={year}
          onChange={onYearChange}
          intensities={intensities}
        />
      </section>

      <div className="mt-auto flex gap-2 pt-2">
        <Link
          href={`/regions/${region.id}/vintage/${year}`}
          className="flex-1 rounded-md bg-wine-600 px-3 py-2 text-center text-sm font-medium text-white hover:bg-wine-700"
        >
          Voir le detail
        </Link>
        <Link
          href={`/compare?region=${region.id}&a=${year}`}
          className="flex-1 rounded-md border border-wine-600 px-3 py-2 text-center text-sm font-medium text-wine-700 hover:bg-wine-50"
        >
          Comparer
        </Link>
      </div>
    </div>
  );
}
