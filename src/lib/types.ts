/**
 * Shared domain types for the wine-vintage climate explorer.
 *
 * These types mirror the SQL data model in `supabase/migrations`. They are the
 * single source of truth for the frontend. When the data model changes, update
 * both the SQL migrations and this file, and document the change in `docs/`.
 */

/**
 * Provenance of any piece of data. This MUST be carried end-to-end so the UI can
 * always tell the user where a number comes from. Never silently mix `synthetic`
 * with `real`.
 */
export type SourceType = "synthetic" | "real" | "manual";

/** Confidence score in [0, 1] attached to every computed indicator. */
export type Confidence = number;

export interface WineRegion {
  /** Stable slug used in URLs, e.g. "bordeaux". */
  id: string;
  name: string;
  /** Short human label, e.g. "Sud-Ouest". */
  macroArea: string;
  /** Representative point [lon, lat] used to center the map / labels. */
  center: [number, number];
  /** Short editorial description of the region's climate identity. */
  blurb: string;
}

/** Calendar month index 1..12. */
export type MonthIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/** Monthly aggregate derived from daily source data (daily -> monthly rollup). */
export interface MonthlyClimate {
  month: MonthIndex;
  /** Mean of daily mean temperature (deg C). */
  tMeanC: number;
  /** Mean of daily max temperature (deg C). */
  tMaxC: number;
  /** Mean of daily min temperature (deg C). */
  tMinC: number;
  /** Total precipitation for the month (mm). */
  precipMm: number;
}

/**
 * The headline indicators computed per region x vintage. Each one is a climate
 * fact (not an interpretation). All are derived from daily data.
 */
export interface ClimateIndicators {
  /** Mean temperature over the growing season (Apr-Sep), deg C. */
  growingSeasonTempC: number;
  /** Growing Degree Days (base 10 deg C), Apr-Oct. */
  gdd: number;
  /** Count of days with Tmax > 30 deg C (growing season). */
  daysAbove30: number;
  /** Count of days with Tmax > 35 deg C (growing season). */
  daysAbove35: number;
  /** Count of spring frost days (Tmin < 0 deg C, Apr-May). */
  springFrostDays: number;
  /** Cumulative rainfall Apr-Sep (mm). */
  rainAprSepMm: number;
  /** Cumulative rainfall Jul-Aug (mm). */
  rainJulAugMm: number;
  /** Cumulative rainfall in September (mm) — harvest-period proxy. */
  rainSepMm: number;
  /** Longest consecutive dry spell in days (growing season). */
  longestDrySpellDays: number;
  /** Synthetic 0-100 water-stress index (higher = more stress). */
  waterStressIndex: number;
  /** Synthetic 0-100 harvest rain-risk index (higher = riskier). */
  harvestRainRiskIndex: number;
}

/** Boolean-ish profile flags surfaced as chips in the UI. */
export interface VintageProfileFlags {
  solaire: boolean;
  frais: boolean;
  pluvieux: boolean;
  sec: boolean;
  stressHydrique: boolean;
  risquePluieVendanges: boolean;
  gelPrintemps: boolean;
  forteChaleur: boolean;
}

/** Full region x vintage record (matches `region_vintage_climate`). */
export interface RegionVintageClimate {
  regionId: string;
  year: number;
  monthly: MonthlyClimate[];
  indicators: ClimateIndicators;
  flags: VintageProfileFlags;
  /** One-paragraph auto-generated, human-readable summary. */
  summary: string;
  sourceType: SourceType;
  confidence: Confidence;
}

/** Soil description (matches `region_soils`). */
export interface RegionSoil {
  regionId: string;
  soilType: string;
  description: string;
  sharePercent: number;
  sourceType: SourceType;
}

/**
 * Generic external scores table (matches `vintage_scores`). V1 does NOT hardcode
 * any protected/proprietary source (e.g. Parker). This is a neutral container.
 */
export interface VintageScore {
  regionId: string;
  year: number;
  sourceName: string;
  scoreValue: number | null;
  scoreScale: string;
  note: string | null;
  sourceType: SourceType;
}
