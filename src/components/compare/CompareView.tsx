"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { WINE_REGIONS, getRegion } from "@/data/regions";
import { getVintage, YEARS } from "@/data/synthetic";
import { INDICATOR_META } from "@/lib/indicators";
import { fmtWithUnit } from "@/lib/format";
import type { ClimateIndicators } from "@/lib/types";
import { FlagChips } from "@/components/FlagChips";
import { SourceBadge } from "@/components/SourceBadge";
import { MonthlyClimateChart } from "@/components/charts/MonthlyClimateChart";

/** Indicators surfaced in the comparison table (per the brief). */
const COMPARE_KEYS: (keyof ClimateIndicators)[] = [
  "growingSeasonTempC",
  "rainAprSepMm",
  "rainSepMm",
  "daysAbove30",
  "daysAbove35",
  "springFrostDays",
];

export function CompareView({
  initialRegion,
  initialA,
  initialB,
}: {
  initialRegion: string;
  initialA: number;
  initialB: number;
}) {
  const [regionId, setRegionId] = useState(initialRegion);
  const [yearA, setYearA] = useState(initialA);
  const [yearB, setYearB] = useState(initialB);

  const region = getRegion(regionId);
  const a = useMemo(() => getVintage(regionId, yearA), [regionId, yearA]);
  const b = useMemo(() => getVintage(regionId, yearB), [regionId, yearB]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <Link href="/" className="text-sm text-wine-700 hover:underline">
        &larr; Retour a la carte
      </Link>
      <h1 className="mt-3 text-2xl font-semibold text-slate-900">
        Comparer deux millesimes
      </h1>
      <p className="text-sm text-slate-500">
        Comparaison de deux millesimes dans une meme region.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <Field label="Region">
          <select
            value={regionId}
            onChange={(e) => setRegionId(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            {WINE_REGIONS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Millesime A">
          <YearSelect value={yearA} onChange={setYearA} />
        </Field>
        <Field label="Millesime B">
          <YearSelect value={yearB} onChange={setYearB} />
        </Field>
      </div>

      {!region || !a || !b ? (
        <p className="mt-6 text-sm text-slate-500">Selection invalide.</p>
      ) : (
        <>
          <h2 className="mt-6 text-lg font-medium text-slate-800">
            {region.name} {yearA} vs {region.name} {yearB}
          </h2>

          <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-3 py-2">Indicateur</th>
                  <th className="px-3 py-2 text-right">{yearA}</th>
                  <th className="px-3 py-2 text-right">{yearB}</th>
                  <th className="px-3 py-2 text-right">Ecart</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE_KEYS.map((key) => {
                  const meta = INDICATOR_META.find((m) => m.key === key)!;
                  const va = a.indicators[key];
                  const vb = b.indicators[key];
                  const diff = vb - va;
                  return (
                    <tr key={key} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-700">{meta.label}</td>
                      <td className="px-3 py-2 text-right font-medium">
                        {fmtWithUnit(va, meta.unit, meta.decimals)}
                      </td>
                      <td className="px-3 py-2 text-right font-medium">
                        {fmtWithUnit(vb, meta.unit, meta.decimals)}
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-medium ${
                          diff > 0
                            ? "text-wine-700"
                            : diff < 0
                              ? "text-blue-700"
                              : "text-slate-400"
                        }`}
                      >
                        {diff > 0 ? "+" : ""}
                        {fmtWithUnit(diff, meta.unit, meta.decimals)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-6 grid gap-6">
            <MonthlyClimateChart
              title="Températures"
              subtitle="Max, moyenne et min sur le même graphe. Les séries peuvent être désactivées."
              mode="temperature"
              vintages={[
                { year: yearA, monthly: a.monthly },
                { year: yearB, monthly: b.monthly },
              ]}
              height={240}
            />
            <MonthlyClimateChart
              title="Hygrométrie"
              subtitle="Comparaison basée sur les précipitations mensuelles disponibles."
              mode="moisture"
              vintages={[
                { year: yearA, monthly: a.monthly },
                { year: yearB, monthly: b.monthly },
              ]}
              height={240}
            />
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            {[
              { v: a, y: yearA },
              { v: b, y: yearB },
            ].map(({ v, y }) => (
              <div key={y} className="rounded-lg border border-slate-200 p-3">
                <div className="mb-1 flex items-center justify-between">
                  <h3 className="font-medium text-slate-800">
                    {region.name} {y}
                  </h3>
                  <SourceBadge
                    sourceType={v.sourceType}
                    confidence={v.confidence}
                  />
                </div>
                <FlagChips flags={v.flags} />
                <p className="mt-2 text-xs leading-relaxed text-slate-600">
                  {v.summary}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function YearSelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (y: number) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
    >
      {YEARS.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  );
}
