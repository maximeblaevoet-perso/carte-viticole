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

/* -------------------------------------------------------------------------- */
/* Hierarchical wine areas (map navigation: region -> sub-region -> village …) */
/* -------------------------------------------------------------------------- */

/**
 * Depth in the wine hierarchy. The hierarchy is intentionally NON-uniform: a
 * given branch only goes as deep as we have meaningful divisions/data for it.
 *
 * 1 = grande région, 2 = sous-région / zone, 3 = village / appellation,
 * 4 = cru / climat (1er cru, grand cru…), 5 = lieu-dit / parcelle.
 */
export type AreaLevel = 1 | 2 | 3 | 4 | 5;

/**
 * Editorial classification of an area. Drives labels and (later) styling. This
 * is descriptive, not a strict 1:1 with {@link AreaLevel} (e.g. a "grand-cru"
 * can be level 2 in Alsace but level 4 in Bourgogne).
 */
export type RegionType =
  | "region"
  | "subregion"
  | "zone"
  | "village"
  | "appellation"
  | "premier-cru"
  | "grand-cru"
  | "lieu-dit"
  | "parcelle";

/**
 * The kinds of business data that *can* be attached to an area. Used to drive
 * what the UI offers and to decide when to show a clean "donnée indisponible"
 * fallback instead of inventing values.
 */
export type DataScope = "climate" | "soils" | "scores" | "vintages";

/**
 * A node in the hierarchical wine map. Geographic contours are kept OUT of this
 * type (see `geoJsonId` + `src/data/geo.ts`) so business metadata and geometry
 * evolve independently.
 */
export interface WineArea {
  /** Stable, globally-unique slug across all levels, e.g. "meursault". */
  id: string;
  name: string;
  level: AreaLevel;
  /** Parent area id, or null for level-1 regions. */
  parentId: string | null;
  /**
   * Id of the level-1 region this node ultimately belongs to. Used to inherit
   * macro data (e.g. regional climate) without duplicating it down the tree.
   */
  rootRegionId: string;
  regionType: RegionType;
  /**
   * Key into the geometry collections in `src/data/geo.ts`. `null` means we
   * have no contour yet for this node (it can still appear via its center).
   */
  geoJsonId: string | null;
  /** Representative point [lon, lat] for centering, labels and point markers. */
  center: [number, number];
  /** Map zoom at/after which this area becomes relevant. */
  zoomMin: number;
  /** Map zoom after which this area is hidden (0 = no upper bound). */
  zoomMax: number;
  /**
   * Scopes for which this node carries its OWN data. Climate is deliberately
   * usually absent below level 1 (climate stays macro/regional for now).
   */
  availableDataScopes: DataScope[];
  blurb?: string;
  /** Marks seed/placeholder nodes that are not yet validated data. */
  provisional?: boolean;
  /** Provenance fields (populated when loaded from Supabase). */
  provenance?: GeoDataProvenance;
  /** INAO appellation id (ingest key). */
  inaoIdApp?: string | null;
  /** INAO denomination id (ingest key). */
  inaoIdDenom?: string | null;
  /** INSEE commune code when the area maps to a commune (e.g. Champagne GC/PC). */
  inseeCommune?: string | null;
}

/* -------------------------------------------------------------------------- */
/* Wine geodata (PostGIS mirror — see migration 0005, ADR 0006)               */
/* -------------------------------------------------------------------------- */

/**
 * Provenance carried by geographic entities (`wine_areas`, `wine_parcels`,
 * `wine_lieux_dits`). Mirrors SQL columns on those tables.
 */
export interface GeoDataProvenance {
  sourceDatasetId: string | null;
  sourceType: SourceType;
  isOfficial: boolean;
  isInformative: boolean;
  sourceUpdatedAt: string | null;
  license: string | null;
  attribution: string | null;
}

/** Public dataset catalog (`source_datasets`). */
export interface SourceDataset {
  id: string;
  name: string;
  provider: string | null;
  sourceUrl: string | null;
  license: string | null;
  attribution: string | null;
  disclaimer: string | null;
  updateNotes: string | null;
  sourceUpdatedAt: string | null;
}

/**
 * Fine parcel geometry (`wine_parcels`). Shown at high zoom only — not part of
 * the hierarchical `WineArea` tree.
 */
export interface WineParcel {
  id: string;
  communeInsee: string | null;
  parcelRef: string | null;
  name: string | null;
  center: [number, number] | null;
  zoomMin: number;
  areaHa: number | null;
  inaoIdAire: string | null;
  rpgPlotId: string | null;
  cadastreSection: string | null;
  cadastreNumero: string | null;
  provenance: GeoDataProvenance;
}

/** Link between a hierarchical area and a fine parcel (`wine_area_parcels`). */
export interface WineAreaParcel {
  wineAreaId: string;
  wineParcelId: string;
  relationship: string;
  sourceType: SourceType;
}

/** Cadastral lieu-dit (`wine_lieux_dits`), especially for Champagne labelling. */
export interface WineLieuDit {
  id: string;
  name: string;
  communeInsee: string | null;
  wineAreaId: string | null;
  center: [number, number] | null;
  cadastreSourceRef: string | null;
  provenance: GeoDataProvenance;
}

/**
 * What kind of geographic feature the user selected on the map. `area` is a
 * node of the hierarchical tree (region → appellation → cru); `parcel` and
 * `lieu-dit` are fine PostGIS geometries shown only at high zoom.
 */
export type SelectedGeoKind = "area" | "parcel" | "lieu-dit";

/**
 * A selection coming from a REAL (PostGIS/MVT) map feature. Synthetic seed
 * areas are still selected by id alone (resolved via `getArea`); this payload
 * carries everything the panel needs for features that are not in the seed
 * tree, plus provenance so the source is always shown.
 */
export interface SelectedGeoFeature {
  kind: SelectedGeoKind;
  id: string;
  name: string;
  level?: AreaLevel;
  regionType?: RegionType | string;
  rootRegionId?: string;
  parentId?: string | null;
  /** Parent area name/type for a lieu-dit (Champagne GC/PC at commune level). */
  areaName?: string | null;
  areaRegionType?: string | null;
  /** Fine-parcel / lieu-dit identifiers. */
  communeInsee?: string | null;
  parcelRef?: string | null;
  areaHa?: number | null;
  cadastreSection?: string | null;
  cadastreNumero?: string | null;
  cadastreSourceRef?: string | null;
  inaoIdAire?: string | null;
  provenance: GeoDataProvenance;
}

/** Calendar month index 1..12. */
export type MonthIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/** Monthly aggregate derived from daily source data (daily -> monthly rollup). */
export interface MonthlyClimate {
  month: MonthIndex;
  /** Mean of daily mean temperature (deg C). */
  tMeanC: number;
  /** Highest daily max temperature in the month (deg C). */
  tMaxC: number;
  /** Lowest daily min temperature in the month (deg C). */
  tMinC: number;
  /** Total precipitation for the month (mm). */
  precipMm: number;
}

/**
 * Week index 1..53 of a fixed 7-day binning anchored on 1 January: week `w`
 * covers days-of-year 7(w-1)+1 .. 7w, so week 53 holds the remaining 1-2 days.
 * These are NOT ISO 8601 weeks — bins are aligned across vintages so two years
 * can be compared week by week. See `docs/climate-methodology.md`.
 */
export type WeekIndex = number;

/**
 * Weekly aggregate derived from the same daily source data as
 * {@link MonthlyClimate}. Temperatures can be `null` when the bin has no
 * observation (real data with gaps); `days` exposes the actual coverage.
 */
export interface WeeklyClimate {
  week: WeekIndex;
  /** First day of the bin, ISO `YYYY-MM-DD`. */
  startDate: string;
  /** Last day of the bin, ISO `YYYY-MM-DD` (inclusive). */
  endDate: string;
  /** Number of days with at least one observation in the bin. */
  days: number;
  /** Mean of daily mean temperature (deg C), null when uncovered. */
  tMeanC: number | null;
  /** Highest daily max temperature in the bin (deg C), null when uncovered. */
  tMaxC: number | null;
  /** Lowest daily min temperature in the bin (deg C), null when uncovered. */
  tMinC: number | null;
  /** Total precipitation for the bin (mm), null when uncovered. */
  precipMm: number | null;
}

/** Time resolution of the temperature / rainfall charts. Monthly is the default. */
export type ClimateGranularity = "monthly" | "weekly";

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
  /** Weekly rollup. Empty when the row predates the weekly backfill. */
  weekly: WeeklyClimate[];
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
