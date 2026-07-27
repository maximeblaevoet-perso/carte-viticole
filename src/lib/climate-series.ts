/**
 * Turns the stored climate rollups into a single, chart-ready series so the UI
 * can switch between monthly and weekly without knowing either shape.
 *
 * Weeks are FIXED 7-day bins anchored on 1 January (week `w` = days-of-year
 * 7(w-1)+1 .. 7w, week 53 holding the remaining 1-2 days), not ISO 8601 weeks.
 * The bins are therefore aligned across vintages, which is what makes the
 * comparison view meaningful. See `docs/climate-methodology.md`.
 */

import { MONTH_LABELS_SHORT, fmtDayMonth } from "./format";
import type {
  ClimateGranularity,
  MonthlyClimate,
  WeeklyClimate,
} from "./types";

/** Number of fixed 7-day bins in a year (the last one is short). */
export const WEEKS_PER_YEAR = 53;

/**
 * One point of a temperature/rainfall series. `null` means "no observation",
 * never zero — charts must skip those points rather than draw them at 0.
 */
export interface ClimatePoint {
  /** Compact axis label, e.g. `Avr` or `S17`. */
  label: string;
  /** Longer label used in tooltips, e.g. `S17 · 23–29 avril`. */
  detailLabel: string;
  tMeanC: number | null;
  tMaxC: number | null;
  tMinC: number | null;
  precipMm: number | null;
}

/** Metric keys shared by both granularities. */
export type ClimateMetricKey = "tMeanC" | "tMaxC" | "tMinC" | "precipMm";

/** Fixed 7-day bin label, e.g. `S17`. */
export function weekLabel(week: number): string {
  return `S${week}`;
}

/** `S17 · 23 – 29 avril` — week number plus the covered date range. */
export function weekDetailLabel(bin: WeeklyClimate): string {
  const end = fmtDayMonth(bin.endDate);
  if (bin.startDate === bin.endDate) return `${weekLabel(bin.week)} · ${end}`;
  // Within a single month the month name is only spelled out once.
  const sameMonth = bin.startDate.slice(0, 7) === bin.endDate.slice(0, 7);
  const start = sameMonth
    ? String(Number(bin.startDate.slice(8, 10)))
    : fmtDayMonth(bin.startDate);
  return `${weekLabel(bin.week)} · ${start} – ${end}`;
}

function fromMonthly(monthly: MonthlyClimate[]): ClimatePoint[] {
  return monthly.map((m) => ({
    label: MONTH_LABELS_SHORT[m.month - 1],
    detailLabel: MONTH_LABELS_SHORT[m.month - 1],
    tMeanC: m.tMeanC,
    tMaxC: m.tMaxC,
    tMinC: m.tMinC,
    precipMm: m.precipMm,
  }));
}

function fromWeekly(weekly: WeeklyClimate[]): ClimatePoint[] {
  return weekly.map((w) => ({
    label: weekLabel(w.week),
    detailLabel: weekDetailLabel(w),
    tMeanC: w.tMeanC,
    tMaxC: w.tMaxC,
    tMinC: w.tMinC,
    precipMm: w.precipMm,
  }));
}

/** Build the chart series for the requested granularity. */
export function toClimateSeries(
  granularity: ClimateGranularity,
  monthly: MonthlyClimate[],
  weekly: WeeklyClimate[] = []
): ClimatePoint[] {
  return granularity === "weekly" ? fromWeekly(weekly) : fromMonthly(monthly);
}

/**
 * Whether the weekly mode can be offered. Rows computed before the weekly
 * rollup existed carry an empty array, and we never fabricate weeks from
 * monthly means.
 */
export function hasWeeklyData(weekly: WeeklyClimate[] | undefined): boolean {
  return Boolean(weekly && weekly.length > 0);
}

/**
 * Axis tick spacing: 53 weekly labels do not fit, so only show every 4th one
 * (Recharts reads this as "skip N labels between ticks"). Monthly keeps the
 * Recharts default, which drops labels only when they would overlap.
 */
export function axisTickInterval(
  granularity: ClimateGranularity
): number | undefined {
  return granularity === "weekly" ? 3 : undefined;
}
