"use client";

/**
 * Temperature & rainfall chart, in monthly (default) or weekly resolution.
 *
 * Both rollups come pre-computed from the data layer (`monthly` / `weekly` on
 * `region_vintage_climate`); this component never derives one from the other.
 * When a record has no weekly rollup the toggle is disabled rather than
 * fabricating weeks out of monthly means.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  axisTickInterval,
  hasWeeklyData,
  toClimateSeries,
  type ClimateMetricKey,
} from "@/lib/climate-series";
import type {
  ClimateGranularity,
  MonthlyClimate,
  WeeklyClimate,
} from "@/lib/types";

type ChartMode = "temperature" | "moisture";

type SeriesDefinition = {
  key: ClimateMetricKey;
  label: string;
  color: string;
  defaultVisible: boolean;
};

type VintageSeries = {
  year: number;
  monthly: MonthlyClimate[];
  weekly?: WeeklyClimate[];
};

type ClimateChartProps =
  | {
      monthly: MonthlyClimate[];
      weekly?: WeeklyClimate[];
      height?: number;
    }
  | {
      title: string;
      subtitle?: string;
      mode: ChartMode;
      vintages: VintageSeries[];
      height?: number;
    };

const TEMPERATURE_SERIES: SeriesDefinition[] = [
  { key: "tMaxC", label: "Max", color: "#dc2626", defaultVisible: false },
  { key: "tMeanC", label: "Moy.", color: "#9d2f44", defaultVisible: true },
  { key: "tMinC", label: "Min", color: "#2563eb", defaultVisible: false },
];

const MOISTURE_SERIES: SeriesDefinition[] = [
  {
    key: "precipMm",
    label: "Précipitations",
    color: "#0f766e",
    defaultVisible: true,
  },
];

const GRANULARITY_OPTIONS: { value: ClimateGranularity; label: string }[] = [
  { value: "monthly", label: "Mensuel" },
  { value: "weekly", label: "Hebdo" },
];

export function ClimateChart(props: ClimateChartProps) {
  if ("monthly" in props) {
    return (
      <SingleClimateChart
        monthly={props.monthly}
        weekly={props.weekly}
        height={props.height}
      />
    );
  }

  return (
    <ComparisonClimateChart
      title={props.title}
      subtitle={props.subtitle}
      mode={props.mode}
      vintages={props.vintages}
      height={props.height}
    />
  );
}

/**
 * Segmented monthly/weekly control. Weekly is disabled (with an explicit
 * reason) when the record carries no weekly rollup.
 */
function GranularityToggle({
  value,
  onChange,
  weeklyAvailable,
}: {
  value: ClimateGranularity;
  onChange: (granularity: ClimateGranularity) => void;
  weeklyAvailable: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Granularité du graphique"
      className="inline-flex overflow-hidden rounded-full border border-slate-200"
    >
      {GRANULARITY_OPTIONS.map((option) => {
        const active = option.value === value;
        const disabled = option.value === "weekly" && !weeklyAvailable;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            title={
              disabled ? "Données hebdomadaires indisponibles" : undefined
            }
            onClick={() => onChange(option.value)}
            className={`px-2.5 py-1 text-xs font-medium transition ${
              active
                ? "bg-slate-800 text-white"
                : disabled
                  ? "cursor-not-allowed bg-white text-slate-300"
                  : "bg-white text-slate-500 hover:bg-slate-50"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Keeps the selection valid when the selected record has no weekly rollup. */
function useGranularity(weeklyAvailable: boolean) {
  const [granularity, setGranularity] =
    useState<ClimateGranularity>("monthly");
  const effective: ClimateGranularity =
    granularity === "weekly" && !weeklyAvailable ? "monthly" : granularity;
  return { granularity: effective, setGranularity };
}

function SingleClimateChart({
  monthly,
  weekly,
  height = 260,
}: {
  monthly: MonthlyClimate[];
  weekly?: WeeklyClimate[];
  height?: number;
}) {
  const weeklyAvailable = hasWeeklyData(weekly);
  const { granularity, setGranularity } = useGranularity(weeklyAvailable);

  const data = useMemo(
    () => toClimateSeries(granularity, monthly, weekly),
    [granularity, monthly, weekly]
  );

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex justify-end">
        <GranularityToggle
          value={granularity}
          onChange={setGranularity}
          weeklyAvailable={weeklyAvailable}
        />
      </div>
      <div className="mt-3">
        <ResponsiveContainer width="100%" height={height}>
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11 }}
              stroke="#94a3b8"
              interval={axisTickInterval(granularity)}
            />
            <YAxis yAxisId="temp" tick={{ fontSize: 11 }} stroke="#94a3b8" unit="°" />
            <YAxis
              yAxisId="rain"
              orientation="right"
              tick={{ fontSize: 11 }}
              stroke="#94a3b8"
              unit=""
            />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0]?.payload as
                  | { detailLabel?: string; label?: string }
                  | undefined;
                return (
                  <div className="rounded-md border border-slate-200 bg-white px-3 py-2 shadow-sm">
                    <p className="mb-1 text-xs font-medium text-slate-600">
                      {point?.detailLabel ?? point?.label}
                    </p>
                    <div className="space-y-1 text-xs">
                      {payload.map((entry: any) => (
                        <div key={entry.dataKey} className="flex items-center gap-2">
                          <span
                            className="inline-block h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: entry.stroke ?? entry.fill ?? "#64748b" }}
                          />
                          <span className="text-slate-700">{entry.name}:</span>
                          <span className="font-medium text-slate-900">
                            {entry.dataKey === "precipMm"
                              ? `${Math.round(Number(entry.value))} mm`
                              : `${Number(entry.value).toFixed(1)} °C`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }}
            />
            <Bar
              yAxisId="rain"
              dataKey="precipMm"
              name="Pluie"
              fill="#60a5fa"
              radius={[3, 3, 0, 0]}
              maxBarSize={22}
            />
            <Line
              yAxisId="temp"
              type="monotone"
              dataKey="tMaxC"
              name="T max"
              stroke="#dc2626"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
            <Line
              yAxisId="temp"
              type="monotone"
              dataKey="tMeanC"
              name="T moy"
              stroke="#9d2f44"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
            <Line
              yAxisId="temp"
              type="monotone"
              dataKey="tMinC"
              name="T min"
              stroke="#2563eb"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function ComparisonClimateChart({
  title,
  subtitle,
  mode,
  vintages,
  height = 260,
}: {
  title: string;
  subtitle?: string;
  mode: ChartMode;
  vintages: VintageSeries[];
  height?: number;
}) {
  const series = useMemo(
    () => (mode === "temperature" ? TEMPERATURE_SERIES : MOISTURE_SERIES),
    [mode]
  );
  const [visibleSeries, setVisibleSeries] = useState<Set<ClimateMetricKey>>(
    () => new Set(series.filter((item) => item.defaultVisible).map((item) => item.key))
  );

  useEffect(() => {
    setVisibleSeries(
      new Set(series.filter((item) => item.defaultVisible).map((item) => item.key))
    );
  }, [series]);

  // Weekly is only offered when BOTH vintages have it, otherwise the two
  // curves would not cover the same buckets.
  const weeklyAvailable =
    vintages.length > 0 && vintages.every((v) => hasWeeklyData(v.weekly));
  const { granularity, setGranularity } = useGranularity(weeklyAvailable);

  const data = useMemo(() => {
    const perVintage = vintages.map((vintage) =>
      toClimateSeries(granularity, vintage.monthly, vintage.weekly)
    );
    const length = perVintage.reduce((max, points) => Math.max(max, points.length), 0);

    return Array.from({ length }, (_, index) => {
      const row: Record<string, string | number | null> = { label: "", detailLabel: "" };
      perVintage.forEach((points, vintageIndex) => {
        const point = points[index];
        if (!point) return;
        if (!row.label) {
          row.label = point.label;
          row.detailLabel = point.detailLabel;
        }
        series.forEach((item) => {
          row[`${vintageIndex}-${item.key}`] = point[item.key];
        });
      });
      return row;
    });
  }, [granularity, series, vintages]);

  const toggleSeries = (key: ClimateMetricKey) => {
    setVisibleSeries((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-medium text-slate-800">{title}</h3>
          {subtitle ? (
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
              {subtitle}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {series.map((item) => {
            const active = visibleSeries.has(item.key);
            return (
              <button
                key={item.key}
                type="button"
                aria-pressed={active}
                onClick={() => toggleSeries(item.key)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                  active
                    ? "border-slate-300 bg-slate-100 text-slate-800"
                    : "border-slate-200 bg-white text-slate-400"
                }`}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                {item.label}
              </button>
            );
          })}
          <GranularityToggle
            value={granularity}
            onChange={setGranularity}
            weeklyAvailable={weeklyAvailable}
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
        {vintages.map((vintage, index) => (
          <span key={vintage.year} className="inline-flex items-center gap-1.5">
            <span
              className={`inline-block h-0.5 w-6 rounded-full ${
                index === 0
                  ? "bg-slate-600"
                  : "border-t-2 border-dashed border-slate-600"
              }`}
            />
            <span>{vintage.year}</span>
          </span>
        ))}
      </div>

      <div className="mt-3">
        <ResponsiveContainer width="100%" height={height}>
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11 }}
              stroke="#94a3b8"
              interval={axisTickInterval(granularity)}
            />
            <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" unit={mode === "temperature" ? "°C" : "mm"} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0]?.payload as
                  | { detailLabel?: string; label?: string }
                  | undefined;
                return (
                  <div className="rounded-md border border-slate-200 bg-white px-3 py-2 shadow-sm">
                    <p className="mb-1 text-xs font-medium text-slate-600">
                      {point?.detailLabel ?? point?.label}
                    </p>
                    <div className="space-y-1">
                      {payload.map((entry: any) => {
                        const stroke = entry.stroke ?? "#64748b";
                        const dash = entry.strokeDasharray;
                        const isTemperature = mode === "temperature";
                        const valueText = isTemperature
                          ? `${Number(entry.value).toFixed(1)} °C`
                          : `${Math.round(Number(entry.value))} mm`;
                        return (
                          <div key={entry.dataKey} className="flex items-center gap-2">
                            <span
                              className="inline-block h-0.5 w-4 shrink-0 rounded-full"
                              style={{
                                backgroundColor: dash
                                  ? "transparent"
                                  : stroke,
                                backgroundImage: dash
                                  ? `repeating-linear-gradient(to right, ${stroke} 0 5px, transparent 5px 11px)`
                                  : undefined,
                              }}
                            />
                            <span className="text-slate-700">{entry.name}:</span>
                            <span className="font-medium text-slate-900">{valueText}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              }}
            />
            {series
              .filter((item) => visibleSeries.has(item.key))
              .flatMap((item) =>
                vintages.map((vintage, vintageIndex) => (
                  <Line
                    key={`${vintage.year}-${item.key}`}
                    type="monotone"
                    dataKey={`${vintageIndex}-${item.key}`}
                    name={`${item.label} ${vintage.year}`}
                    stroke={item.color}
                    strokeWidth={vintageIndex === 0 ? 2.2 : 1.8}
                    strokeDasharray={vintageIndex === 0 ? undefined : "4 3"}
                    dot={false}
                    connectNulls
                  />
                ))
              )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
