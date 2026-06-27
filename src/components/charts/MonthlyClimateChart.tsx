"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MONTH_LABELS_SHORT } from "@/lib/format";
import type { MonthlyClimate } from "@/lib/types";

/**
 * Default V1 chart: monthly granularity. Bars = precipitation (mm, right axis),
 * lines = mean / max / min temperature (deg C, left axis). Daily data is the
 * computation source but is NOT the default display (see methodology).
 */
export function MonthlyClimateChart({
  monthly,
  height = 260,
}: {
  monthly: MonthlyClimate[];
  height?: number;
}) {
  const data = monthly.map((m) => ({
    month: MONTH_LABELS_SHORT[m.month - 1],
    tMean: m.tMeanC,
    tMax: m.tMaxC,
    tMin: m.tMinC,
    precip: m.precipMm,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#94a3b8" />
        <YAxis
          yAxisId="temp"
          tick={{ fontSize: 11 }}
          stroke="#94a3b8"
          unit="°"
        />
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
        <Legend wrapperStyle={{ fontSize: 11 }} />
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
  );
}
