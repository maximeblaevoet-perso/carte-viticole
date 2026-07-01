/**
 * Climate data-access layer (region × vintage).
 *
 * This is the single seam between the UI and the backend. It returns the SAME
 * TypeScript types the UI already consumes (`RegionVintageClimate`), so callers
 * don't care where the data comes from.
 *
 * Behaviour:
 * - When Supabase is configured for real data (see `shouldUseSupabase`), it
 *   reads pre-computed aggregates from `region_vintage_climate` — including the
 *   `monthly` rollup that powers the default charts.
 * - Otherwise (or on any error / missing row) it falls back to the synthetic
 *   engine.
 *
 * IMPORTANT: this layer NEVER queries `daily_weather`. Daily rows are the
 * ingestion/computation source only; the frontend reads aggregates. See
 * `docs/decisions/0005-serve-monthly-climate-aggregates.md`.
 */

import type {
  MonthIndex,
  MonthlyClimate,
  RegionVintageClimate,
  SourceType,
  VintageProfileFlags,
} from "@/lib/types";
import { getSupabaseClient, shouldUseSupabase } from "@/lib/supabase";
import {
  getRegionVintages as getSyntheticRegionVintages,
  getVintage as getSyntheticVintage,
} from "./synthetic";

/** Columns selected from `region_vintage_climate` (never `daily_weather`). */
const CLIMATE_COLUMNS =
  "region_id, vintage_year, growing_season_temp_c, gdd, days_above_30, " +
  "days_above_35, spring_frost_days, rain_apr_sep_mm, rain_jul_aug_mm, " +
  "rain_sep_mm, longest_dry_spell_days, water_stress_index, " +
  "harvest_rain_risk_index, flags, summary, monthly, source_type, confidence";

/** Synchronous synthetic accessors, re-exported for use as an instant seed. */
export {
  getSyntheticRegionVintages,
  getSyntheticVintage,
};

/**
 * Get all vintages for a region. Tries Supabase (real aggregates) and falls
 * back to synthetic when not configured, on error, or when no rows exist.
 */
export async function getRegionVintageClimates(
  regionId: string
): Promise<RegionVintageClimate[]> {
  const fallback = () => getSyntheticRegionVintages(regionId);

  if (!shouldUseSupabase()) return fallback();
  const client = getSupabaseClient();
  if (!client) return fallback();

  try {
    const { data, error } = await client
      .from("region_vintage_climate")
      .select(CLIMATE_COLUMNS)
      .eq("region_id", regionId)
      .order("vintage_year", { ascending: true });

    if (error || !data || data.length === 0) return fallback();
    return data.map(mapRow);
  } catch {
    return fallback();
  }
}

/**
 * Get a single region × vintage record. Same fallback policy as
 * {@link getRegionVintageClimates}.
 */
export async function getVintageClimate(
  regionId: string,
  year: number
): Promise<RegionVintageClimate | undefined> {
  const fallback = () => getSyntheticVintage(regionId, year);

  if (!shouldUseSupabase()) return fallback();
  const client = getSupabaseClient();
  if (!client) return fallback();

  try {
    const { data, error } = await client
      .from("region_vintage_climate")
      .select(CLIMATE_COLUMNS)
      .eq("region_id", regionId)
      .eq("vintage_year", year)
      .maybeSingle();

    if (error || !data) return fallback();
    return mapRow(data);
  } catch {
    return fallback();
  }
}

/* -------------------------------------------------------------------------- */
/* row mapping: snake_case SQL -> camelCase TS types                          */
/* -------------------------------------------------------------------------- */

type ClimateRow = Record<string, unknown>;

function num(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function mapMonthly(raw: unknown): MonthlyClimate[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((m) => {
    const r = m as Record<string, unknown>;
    return {
      month: num(r.month) as MonthIndex,
      tMeanC: num(r.t_mean_c ?? r.tMeanC),
      tMaxC: num(r.t_max_c ?? r.tMaxC),
      tMinC: num(r.t_min_c ?? r.tMinC),
      precipMm: num(r.precip_mm ?? r.precipMm),
    };
  });
}

function mapFlags(raw: unknown): VintageProfileFlags {
  const f = (raw ?? {}) as Record<string, unknown>;
  return {
    solaire: Boolean(f.solaire),
    frais: Boolean(f.frais),
    pluvieux: Boolean(f.pluvieux),
    sec: Boolean(f.sec),
    stressHydrique: Boolean(f.stressHydrique),
    risquePluieVendanges: Boolean(f.risquePluieVendanges),
    gelPrintemps: Boolean(f.gelPrintemps),
    forteChaleur: Boolean(f.forteChaleur),
  };
}

function mapRow(row: ClimateRow): RegionVintageClimate {
  return {
    regionId: String(row.region_id),
    year: num(row.vintage_year),
    monthly: mapMonthly(row.monthly),
    indicators: {
      growingSeasonTempC: num(row.growing_season_temp_c),
      gdd: num(row.gdd),
      daysAbove30: num(row.days_above_30),
      daysAbove35: num(row.days_above_35),
      springFrostDays: num(row.spring_frost_days),
      rainAprSepMm: num(row.rain_apr_sep_mm),
      rainJulAugMm: num(row.rain_jul_aug_mm),
      rainSepMm: num(row.rain_sep_mm),
      longestDrySpellDays: num(row.longest_dry_spell_days),
      waterStressIndex: num(row.water_stress_index),
      harvestRainRiskIndex: num(row.harvest_rain_risk_index),
    },
    flags: mapFlags(row.flags),
    summary: String(row.summary ?? ""),
    sourceType: (row.source_type as SourceType) ?? "synthetic",
    confidence: num(row.confidence),
  };
}
