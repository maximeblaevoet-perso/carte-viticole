"use client";

import Link from "next/link";
import { useMemo } from "react";
import { getRegion } from "@/data/regions";
import {
  getAncestors,
  getArea,
  getChildren,
  REGION_TYPE_LABELS,
} from "@/data/areas";
import { getSoilsForArea } from "@/data/soils";
import {
  useRegionVintageClimates,
  useVintageClimate,
} from "@/hooks/useClimate";
import { FlagChips } from "@/components/FlagChips";
import { KeyIndicators } from "@/components/KeyIndicators";
import { SourceBadge } from "@/components/SourceBadge";
import { VintageTimeline } from "@/components/VintageTimeline";
import { MonthlyClimateChart } from "@/components/charts/MonthlyClimateChart";

/** Small, consistent "donnée indisponible" fallback. */
function DataUnavailable({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-500">
      {children}
    </div>
  );
}

/**
 * Shared panel body for the desktop side panel and the mobile bottom sheet.
 *
 * It is now AREA-aware: it works for any node of the hierarchy. Climate stays
 * MACRO (resolved from the level-1 region via `rootRegionId`); soils can be
 * finer (resolved with a fallback up the tree). Missing data shows a clean
 * "donnée indisponible" fallback instead of inventing values.
 */
export function RegionPanelContent({
  areaId,
  year,
  onYearChange,
  onSelectArea,
}: {
  areaId: string | null;
  year: number;
  onYearChange: (year: number) => void;
  onSelectArea: (areaId: string) => void;
}) {
  const area = getArea(areaId);
  const rootRegionId = area?.rootRegionId;
  const region = rootRegionId ? getRegion(rootRegionId) : undefined;
  const vintage = useVintageClimate(rootRegionId, year);
  const regionVintages = useRegionVintageClimates(rootRegionId);

  const ancestors = area ? getAncestors(area.id) : [];
  const children = area ? getChildren(area.id) : [];
  const resolvedSoils = area ? getSoilsForArea(area.id) : undefined;

  // Per-year warmth intensities for the timeline tint (regional series).
  const intensities = useMemo(() => {
    const vintages = regionVintages;
    if (vintages.length === 0) return undefined;
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
  }, [regionVintages]);

  if (!area || !region) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <p className="text-sm text-slate-500">
          Sélectionnez une région sur la carte, puis zoomez pour explorer ses
          sous-régions, villages et crus.
        </p>
      </div>
    );
  }

  const isRegion = area.level === 1;

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      {/* Breadcrumb */}
      {ancestors.length > 0 && (
        <nav className="flex flex-wrap items-center gap-1 text-[11px] text-slate-400">
          {ancestors.map((a) => (
            <span key={a.id} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onSelectArea(a.id)}
                className="hover:text-wine-700 hover:underline"
              >
                {a.name}
              </button>
              <span aria-hidden>›</span>
            </span>
          ))}
          <span className="text-slate-600">{area.name}</span>
        </nav>
      )}

      <div>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{area.name}</h2>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                {REGION_TYPE_LABELS[area.regionType]} · niveau {area.level}
              </span>
              {area.provisional && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700">
                  Seed / provisoire
                </span>
              )}
            </div>
          </div>
          <span className="rounded-md bg-wine-600 px-2.5 py-1 text-sm font-semibold text-white">
            {year}
          </span>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-600">
          {area.blurb ?? region.blurb}
        </p>
      </div>

      {/* Drill-down navigation */}
      {children.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Sous-secteurs
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {children.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelectArea(c.id)}
                className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:border-wine-400 hover:bg-wine-50"
              >
                {c.name}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Climate (always macro / regional) */}
      <section>
        <div className="mb-1.5 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Profil du millésime
          </h3>
          {vintage && (
            <SourceBadge
              sourceType={vintage.sourceType}
              confidence={vintage.confidence}
            />
          )}
        </div>
        {!isRegion && (
          <p className="mb-2 text-[11px] italic text-slate-400">
            Climat affiché au niveau régional ({region.name}). Les données fines
            de météo/climat viendront plus tard.
          </p>
        )}
        {vintage ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm leading-relaxed text-slate-700">
              {vintage.summary}
            </p>
            <div className="mt-2.5">
              <FlagChips flags={vintage.flags} />
            </div>
          </div>
        ) : (
          <DataUnavailable>
            Donnée climatique indisponible pour {region.name} {year}.
          </DataUnavailable>
        )}
      </section>

      {vintage && (
        <>
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Indicateurs clés
            </h3>
            <KeyIndicators indicators={vintage.indicators} />
          </section>

          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Climat mensuel
            </h3>
            <MonthlyClimateChart monthly={vintage.monthly} height={200} />
          </section>
        </>
      )}

      {/* Soils (can be finer than region) */}
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Sols
        </h3>
        {resolvedSoils && resolvedSoils.scope !== "none" ? (
          <div className="space-y-2">
            {resolvedSoils.scope === "inherited" && (
              <p className="text-[11px] italic text-slate-400">
                Sols hérités de {getArea(resolvedSoils.sourceAreaId ?? "")?.name ??
                  region.name}
                . Donnée fine non encore disponible à ce niveau.
              </p>
            )}
            {resolvedSoils.soils.map((s) => (
              <div
                key={s.soilType}
                className="rounded-lg border border-slate-200 p-2.5"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-slate-800">
                    {s.soilType}
                  </h4>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">
                      {s.sharePercent}%
                    </span>
                    <SourceBadge sourceType={s.sourceType} />
                  </div>
                </div>
                <p className="mt-1 text-xs text-slate-600">{s.description}</p>
              </div>
            ))}
          </div>
        ) : (
          <DataUnavailable>
            Donnée de sols indisponible pour {area.name}.
          </DataUnavailable>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Millésimes
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
          Voir le détail
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
