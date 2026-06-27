/**
 * Climate-indicator helpers: derive profile flags and human-readable summaries
 * from computed indicators. Pure functions, reusable for synthetic AND real data.
 *
 * IMPORTANT: This module only INTERPRETS already-computed climate facts. The
 * facts themselves (monthly rollups, day counts, cumulative rainfall) must be
 * computed from daily source data — see `docs/climate-methodology.md`.
 */

import type {
  ClimateIndicators,
  MonthlyClimate,
  VintageProfileFlags,
} from "./types";

/**
 * Region-relative reference values (typically medians across the region's
 * vintages). Used to decide whether a given vintage is "warm" / "cool" /
 * "wet" / "dry" RELATIVE to its own region, which is more meaningful than a
 * single national threshold.
 */
export interface RegionReference {
  growingSeasonTempC: number;
  rainAprSepMm: number;
}

/** Absolute thresholds used for the binary risk flags. */
export const THRESHOLDS = {
  heatDaysAbove30: 18,
  heatDaysAbove35: 4,
  springFrostDays: 3,
  harvestRainMm: 80,
  waterStressIndex: 60,
  /** Relative deltas vs region reference. */
  warmDeltaC: 0.6,
  coolDeltaC: 0.6,
  wetRatio: 1.15,
  dryRatio: 0.85,
} as const;

export function deriveFlags(
  ind: ClimateIndicators,
  ref: RegionReference
): VintageProfileFlags {
  return {
    solaire: ind.growingSeasonTempC >= ref.growingSeasonTempC + THRESHOLDS.warmDeltaC,
    frais: ind.growingSeasonTempC <= ref.growingSeasonTempC - THRESHOLDS.coolDeltaC,
    pluvieux: ind.rainAprSepMm >= ref.rainAprSepMm * THRESHOLDS.wetRatio,
    sec: ind.rainAprSepMm <= ref.rainAprSepMm * THRESHOLDS.dryRatio,
    stressHydrique: ind.waterStressIndex >= THRESHOLDS.waterStressIndex,
    risquePluieVendanges: ind.rainSepMm >= THRESHOLDS.harvestRainMm,
    gelPrintemps: ind.springFrostDays >= THRESHOLDS.springFrostDays,
    forteChaleur:
      ind.daysAbove35 >= THRESHOLDS.heatDaysAbove35 ||
      ind.daysAbove30 >= THRESHOLDS.heatDaysAbove30,
  };
}

/** Human-readable label for each flag (French, for the UI). */
export const FLAG_LABELS: Record<keyof VintageProfileFlags, string> = {
  solaire: "Millesime solaire",
  frais: "Millesime frais",
  pluvieux: "Millesime pluvieux",
  sec: "Millesime sec",
  stressHydrique: "Stress hydrique probable",
  risquePluieVendanges: "Risque pluie vendanges",
  gelPrintemps: "Gel de printemps",
  forteChaleur: "Forte chaleur",
};

/** Metadata describing each headline indicator for table/legend rendering. */
export interface IndicatorMeta {
  key: keyof ClimateIndicators;
  label: string;
  unit: string;
  /** For comparison: is "higher" the warmer/wetter/riskier direction? */
  higherIs: "warmer" | "wetter" | "riskier" | "neutral";
  decimals: number;
}

export const INDICATOR_META: IndicatorMeta[] = [
  { key: "growingSeasonTempC", label: "Temp. saison (avr-sep)", unit: "C", higherIs: "warmer", decimals: 1 },
  { key: "gdd", label: "Degres-jours (GDD)", unit: "", higherIs: "warmer", decimals: 0 },
  { key: "daysAbove30", label: "Jours > 30 C", unit: "j", higherIs: "warmer", decimals: 0 },
  { key: "daysAbove35", label: "Jours > 35 C", unit: "j", higherIs: "warmer", decimals: 0 },
  { key: "springFrostDays", label: "Gel de printemps", unit: "j", higherIs: "riskier", decimals: 0 },
  { key: "rainAprSepMm", label: "Pluie avr-sep", unit: "mm", higherIs: "wetter", decimals: 0 },
  { key: "rainJulAugMm", label: "Pluie juil-aout", unit: "mm", higherIs: "wetter", decimals: 0 },
  { key: "rainSepMm", label: "Pluie septembre", unit: "mm", higherIs: "riskier", decimals: 0 },
  { key: "longestDrySpellDays", label: "Plus longue periode sans pluie", unit: "j", higherIs: "neutral", decimals: 0 },
  { key: "waterStressIndex", label: "Indice stress hydrique", unit: "/100", higherIs: "riskier", decimals: 0 },
  { key: "harvestRainRiskIndex", label: "Risque pluie vendanges", unit: "/100", higherIs: "riskier", decimals: 0 },
];

/**
 * Build a short, factual French summary. Interpretation stays light and is
 * explicitly derived from the flags/indicators (climate facts first).
 */
export function generateSummary(
  regionName: string,
  year: number,
  ind: ClimateIndicators,
  flags: VintageProfileFlags
): string {
  const parts: string[] = [];

  if (flags.solaire) parts.push("millesime chaud et solaire");
  else if (flags.frais) parts.push("millesime frais");
  else parts.push("millesime de chaleur moyenne pour la region");

  if (flags.sec) parts.push("annee plutot seche");
  else if (flags.pluvieux) parts.push("annee plutot pluvieuse");

  const risks: string[] = [];
  if (flags.gelPrintemps) risks.push(`gel de printemps (${ind.springFrostDays} j)`);
  if (flags.forteChaleur) risks.push(`episodes de forte chaleur (${ind.daysAbove30} j > 30 C)`);
  if (flags.stressHydrique) risks.push("stress hydrique probable");
  if (flags.risquePluieVendanges)
    risks.push(`pluie autour des vendanges (${Math.round(ind.rainSepMm)} mm en sept.)`);

  let text = `${regionName} ${year} : ${parts.join(", ")}.`;
  if (risks.length > 0) {
    text += ` Points de vigilance : ${risks.join(" ; ")}.`;
  } else {
    text += " Pas de risque climatique majeur identifie sur les indicateurs suivis.";
  }
  return text;
}

/** Convenience: median of a numeric array. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/** Recompute the seasonal-rollup indicators that depend only on monthly data. */
export function rainFromMonthly(monthly: MonthlyClimate[]): {
  rainAprSepMm: number;
  rainJulAugMm: number;
  rainSepMm: number;
} {
  const byMonth = (m: number) => monthly.find((x) => x.month === m)?.precipMm ?? 0;
  const rainAprSepMm = [4, 5, 6, 7, 8, 9].reduce((s, m) => s + byMonth(m), 0);
  const rainJulAugMm = [7, 8].reduce((s, m) => s + byMonth(m), 0);
  const rainSepMm = byMonth(9);
  return { rainAprSepMm, rainJulAugMm, rainSepMm };
}
