/**
 * Synthetic data engine.
 *
 * This module generates DETERMINISTIC, clearly-labelled synthetic climate data
 * for the three V1 regions and vintages 2000-2024. It demonstrates the real
 * pipeline shape: generate a DAILY series (the source granularity for V1), then
 * roll it up to monthly aggregates and compute the headline indicators.
 *
 * Every record produced here carries `sourceType: "synthetic"`. This data MUST
 * NEVER be presented as real. When real Météo-France data is ingested, the same
 * indicator-computation logic should be applied to real daily series.
 *
 * See `docs/climate-methodology.md` for the indicator definitions.
 */

import {
  deriveFlags,
  generateSummary,
  median,
  type RegionReference,
} from "@/lib/indicators";
import type {
  ClimateIndicators,
  MonthIndex,
  MonthlyClimate,
  RegionVintageClimate,
} from "@/lib/types";
import { REGION_BASELINES, type RegionBaseline } from "./regions";

export const FIRST_YEAR = 2000;
export const LAST_YEAR = 2024;
export const YEARS: number[] = Array.from(
  { length: LAST_YEAR - FIRST_YEAR + 1 },
  (_, i) => FIRST_YEAR + i
);

// --- deterministic PRNG -----------------------------------------------------

function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard-normal sample via Box-Muller. */
function gauss(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// --- daily series -----------------------------------------------------------

interface DayRecord {
  month: MonthIndex;
  tMin: number;
  tMax: number;
  tMean: number;
  precipMm: number;
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function monthForDoy(doy: number): MonthIndex {
  let acc = 0;
  for (let m = 0; m < 12; m++) {
    acc += DAYS_IN_MONTH[m];
    if (doy <= acc) return (m + 1) as MonthIndex;
  }
  return 12;
}

/**
 * Generate a full-year synthetic daily series for one region x vintage.
 * Deterministic in (regionId, year).
 */
export function generateDailySeries(
  base: RegionBaseline,
  year: number
): DayRecord[] {
  const rng = mulberry32(hashSeed(`${base.id}:${year}`));

  // Per-year anomalies (shared by the whole year).
  const warming = base.warmingPerYear * (year - FIRST_YEAR);
  const yearTempAnomaly = gauss(rng) * 0.9 + warming;
  const yearWetFactor = Math.max(0.45, 1 + gauss(rng) * 0.28);

  const PEAK_DOY = 200; // ~ mid-July
  const days: DayRecord[] = [];

  for (let doy = 1; doy <= 365; doy++) {
    const month = monthForDoy(doy);
    const seasonal = Math.cos((2 * Math.PI * (doy - PEAK_DOY)) / 365);

    const seasonalMax = base.tMaxMean + base.tMaxAmp * seasonal;
    const seasonalMin = base.tMinMean + base.tMinAmp * seasonal;

    const noiseMax = gauss(rng) * 3.0;
    const noiseMin = gauss(rng) * 2.6;

    const tMax = seasonalMax + yearTempAnomaly + noiseMax;
    let tMin = seasonalMin + yearTempAnomaly * 0.85 + noiseMin;
    if (tMin > tMax - 1.5) tMin = tMax - 1.5;
    const tMean = (tMax + tMin) / 2;

    // Precipitation: per-month rain probability + exponential intensity.
    const mIdx = month - 1;
    const rainDays = base.monthlyRainDays[mIdx];
    const targetMm = base.monthlyRainMm[mIdx] * yearWetFactor;
    const pRain = Math.min(0.95, rainDays / DAYS_IN_MONTH[mIdx]);
    let precipMm = 0;
    if (rng() < pRain) {
      const meanIntensity = targetMm / Math.max(1, rainDays);
      precipMm = -Math.log(1 - rng()) * meanIntensity;
    }

    days.push({ month, tMin, tMax, tMean, precipMm });
  }

  return days;
}

// --- rollups & indicators ---------------------------------------------------

function rollupMonthly(days: DayRecord[]): MonthlyClimate[] {
  const monthly: MonthlyClimate[] = [];
  for (let m = 1; m <= 12; m++) {
    const ds = days.filter((d) => d.month === m);
    const n = ds.length || 1;
    monthly.push({
      month: m as MonthIndex,
      tMeanC: round1(ds.reduce((s, d) => s + d.tMean, 0) / n),
      tMaxC: round1(ds.reduce((s, d) => s + d.tMax, 0) / n),
      tMinC: round1(ds.reduce((s, d) => s + d.tMin, 0) / n),
      precipMm: Math.round(ds.reduce((s, d) => s + d.precipMm, 0)),
    });
  }
  return monthly;
}

function computeIndicators(days: DayRecord[]): ClimateIndicators {
  const inSeason = (d: DayRecord) => d.month >= 4 && d.month <= 10;
  const aprSep = (d: DayRecord) => d.month >= 4 && d.month <= 9;

  const seasonDays = days.filter(inSeason);
  const seasonMeanDays = days.filter(aprSep);

  const growingSeasonTempC =
    seasonMeanDays.reduce((s, d) => s + d.tMean, 0) / (seasonMeanDays.length || 1);

  const gdd = seasonDays.reduce((s, d) => s + Math.max(0, d.tMean - 10), 0);

  const daysAbove30 = seasonDays.filter((d) => d.tMax > 30).length;
  const daysAbove35 = seasonDays.filter((d) => d.tMax > 35).length;

  const springFrostDays = days.filter(
    (d) => (d.month === 4 || d.month === 5) && d.tMin < 0
  ).length;

  const sumPrecip = (pred: (d: DayRecord) => boolean) =>
    days.filter(pred).reduce((s, d) => s + d.precipMm, 0);

  const rainAprSepMm = sumPrecip(aprSep);
  const rainJulAugMm = sumPrecip((d) => d.month === 7 || d.month === 8);
  const rainSepMm = sumPrecip((d) => d.month === 9);

  // Longest dry spell (precip < 1mm) within the growing season.
  let longest = 0;
  let run = 0;
  for (const d of seasonDays) {
    if (d.precipMm < 1) {
      run += 1;
      if (run > longest) longest = run;
    } else {
      run = 0;
    }
  }

  // Synthetic composite indices (0-100).
  const waterStressIndex = clamp(
    Math.round(
      40 +
        (90 - rainJulAugMm) * 0.35 +
        (daysAbove30 - 12) * 1.2 +
        (longest - 14) * 1.0
    ),
    0,
    100
  );

  const sepRainDays = days.filter((d) => d.month === 9 && d.precipMm >= 1).length;
  const harvestRainRiskIndex = clamp(
    Math.round((rainSepMm - 30) * 0.7 + sepRainDays * 3.5),
    0,
    100
  );

  return {
    growingSeasonTempC: round1(growingSeasonTempC),
    gdd: Math.round(gdd),
    daysAbove30,
    daysAbove35,
    springFrostDays,
    rainAprSepMm: Math.round(rainAprSepMm),
    rainJulAugMm: Math.round(rainJulAugMm),
    rainSepMm: Math.round(rainSepMm),
    longestDrySpellDays: longest,
    waterStressIndex,
    harvestRainRiskIndex,
  };
}

// --- public API -------------------------------------------------------------

interface RawVintage {
  regionId: string;
  year: number;
  monthly: MonthlyClimate[];
  indicators: ClimateIndicators;
}

function buildRawVintage(base: RegionBaseline, year: number): RawVintage {
  const days = generateDailySeries(base, year);
  return {
    regionId: base.id,
    year,
    monthly: rollupMonthly(days),
    indicators: computeIndicators(days),
  };
}

/** Build all vintages for one region, deriving region-relative flags + summary. */
function buildRegionVintages(base: RegionBaseline): RegionVintageClimate[] {
  const raws = YEARS.map((y) => buildRawVintage(base, y));

  const ref: RegionReference = {
    growingSeasonTempC: median(raws.map((r) => r.indicators.growingSeasonTempC)),
    rainAprSepMm: median(raws.map((r) => r.indicators.rainAprSepMm)),
  };

  return raws.map((r) => {
    const flags = deriveFlags(r.indicators, ref);
    return {
      regionId: r.regionId,
      year: r.year,
      monthly: r.monthly,
      indicators: r.indicators,
      flags,
      summary: generateSummary(
        REGION_BASELINES.find((b) => b.id === r.regionId)!.name,
        r.year,
        r.indicators,
        flags
      ),
      sourceType: "synthetic",
      confidence: 0.4, // synthetic demo data: deliberately low confidence
    };
  });
}

let _cache: Map<string, RegionVintageClimate[]> | null = null;

function ensureCache(): Map<string, RegionVintageClimate[]> {
  if (_cache) return _cache;
  _cache = new Map();
  for (const base of REGION_BASELINES) {
    _cache.set(base.id, buildRegionVintages(base));
  }
  return _cache;
}

export function getRegionVintages(regionId: string): RegionVintageClimate[] {
  return ensureCache().get(regionId) ?? [];
}

export function getVintage(
  regionId: string,
  year: number
): RegionVintageClimate | undefined {
  return getRegionVintages(regionId).find((v) => v.year === year);
}

// --- small math helpers -----------------------------------------------------

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
