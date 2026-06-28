"use client";

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
import { MONTH_LABELS_SHORT } from "@/lib/format";
import type { MonthlyClimate } from "@/lib/types";

type ChartMode = "temperature" | "moisture";
type MonthlyMetricKey = "tMaxC" | "tMeanC" | "tMinC" | "precipMm";

type SeriesDefinition = {
  key: MonthlyMetricKey;
  label: string;
  color: string;
  defaultVisible: boolean;
};

type VintageSeries = {
  year: number;
  monthly: MonthlyClimate[];
};

type MonthlyChartProps =
  | {
      monthly: MonthlyClimate[];
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

export function MonthlyClimateChart(props: MonthlyChartProps) {
  if ("monthly" in props) {
    return <SingleMonthlyChart monthly={props.monthly} height={props.height} />;
  }

  return (
    <ComparisonMonthlyChart
      title={props.title}
      subtitle={props.subtitle}
      mode={props.mode}
      vintages={props.vintages}
      height={props.height}
    />
  );
}

function SingleMonthlyChart({
  monthly,
  height = 260,
}: {
  monthly: MonthlyClimate[];
  height?: number;
}) {
  const data = useMemo(
    () =>
      monthly.map((m) => ({
        month: MONTH_LABELS_SHORT[m.month - 1],
        tMean: m.tMeanC,
        tMax: m.tMaxC,
        tMin: m.tMinC,
        precip: m.precipMm,
      })),
    [monthly]
  );

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mt-3">
        <ResponsiveContainer width="100%" height={height}>
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#94a3b8" />
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
              formatter={(value: number, name: string) => {
                if (name === "Pluie") return [`${value} mm`, name];
                return [`${value} °C`, name];
              }}
            />
            <Bar
              yAxisId="rain"
              dataKey="precip"
              name="Pluie"
              fill="#60a5fa"
              radius={[3, 3, 0, 0]}
              maxBarSize={22}
            />
            <Line
              yAxisId="temp"
              type="monotone"
              dataKey="tMax"
              name="T max"
              stroke="#dc2626"
              strokeWidth={2}
              dot={false}
            />
            <Line
              yAxisId="temp"
              type="monotone"
              dataKey="tMean"
              name="T moy"
              stroke="#9d2f44"
              strokeWidth={2}
              dot={false}
            />
            <Line
              yAxisId="temp"
              type="monotone"
              dataKey="tMin"
              name="T min"
              stroke="#2563eb"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function ComparisonMonthlyChart({
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
  const [visibleSeries, setVisibleSeries] = useState<Set<MonthlyMetricKey>>(
    () => new Set(series.filter((item) => item.defaultVisible).map((item) => item.key))
  );

  useEffect(() => {
    setVisibleSeries(
      new Set(series.filter((item) => item.defaultVisible).map((item) => item.key))
    );
  }, [series]);

  const data = useMemo(
    () =>
      MONTH_LABELS_SHORT.map((month, monthIndex) => {
        const row: Record<string, string | number | null> = { month };
        vintages.forEach((vintage, vintageIndex) => {
          const monthlyRow = vintage.monthly[monthIndex];
          if (!monthlyRow) return;
          series.forEach((item) => {
            row[`${vintageIndex}-${item.key}`] = monthlyRow[item.key];
          });
        });
        return row;
      }),
    [series, vintages]
  );

  const toggleSeries = (key: MonthlyMetricKey) => {
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
        <div className="flex flex-wrap gap-1.5">
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
            <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#94a3b8" />
            <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" unit={mode === "temperature" ? "°C" : "mm"} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
              content={({ active, label, payload }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div className="rounded-md border border-slate-200 bg-white px-3 py-2 shadow-sm">
                    <p className="mb-1 text-xs font-medium text-slate-600">{label}</p>
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
