/**
 * Region metadata + climate baselines used by the synthetic data generator,
 * plus approximate GeoJSON footprints for the map.
 *
 * NOTE: These baselines drive SYNTHETIC demo data only. Real Météo-France data
 * will replace the generated series via the ingestion pipeline (see
 * `scripts/import_meteo_france.py` and `docs/data-sources.md`). The geometries
 * here are rough editorial footprints, NOT official AOC boundaries.
 */

import type { WineRegion } from "@/lib/types";
import type { FeatureCollection, Polygon } from "geojson";

export interface RegionBaseline extends WineRegion {
  /** Annual mean of daily Tmax (deg C). */
  tMaxMean: number;
  /** Annual mean of daily Tmin (deg C). */
  tMinMean: number;
  /** Seasonal amplitude of Tmax (deg C). */
  tMaxAmp: number;
  /** Seasonal amplitude of Tmin (deg C). */
  tMinAmp: number;
  /** Per-decade warming trend (deg C / year). */
  warmingPerYear: number;
  /** Typical monthly rainfall total (mm), index 0 = Jan. */
  monthlyRainMm: number[];
  /** Typical number of rain days per month, index 0 = Jan. */
  monthlyRainDays: number[];
  /** Continentality factor (0 maritime .. 1 continental) — drives frost risk. */
  continentality: number;
}

export const REGION_BASELINES: RegionBaseline[] = [
  {
    id: "bordeaux",
    name: "Bordeaux",
    macroArea: "Sud-Ouest",
    center: [-0.578, 44.837],
    blurb:
      "Climat oceanique tempere, influence par l'estuaire de la Gironde. Hivers doux, etes chauds, automnes souvent humides.",
    tMaxMean: 18.6,
    tMinMean: 9.4,
    tMaxAmp: 8.6,
    tMinAmp: 7.4,
    warmingPerYear: 0.04,
    monthlyRainMm: [92, 78, 70, 80, 84, 62, 52, 56, 88, 100, 110, 102],
    monthlyRainDays: [13, 11, 11, 12, 12, 8, 7, 7, 9, 11, 13, 13],
    continentality: 0.25,
  },
  {
    id: "bourgogne",
    name: "Bourgogne",
    macroArea: "Centre-Est",
    center: [4.84, 47.02],
    blurb:
      "Climat semi-continental a tendance fraiche. Forte sensibilite au gel de printemps, etes variables.",
    tMaxMean: 16.2,
    tMinMean: 6.8,
    tMaxAmp: 9.8,
    tMinAmp: 8.2,
    warmingPerYear: 0.045,
    monthlyRainMm: [60, 56, 56, 66, 84, 72, 66, 64, 70, 72, 66, 66],
    monthlyRainDays: [11, 10, 10, 11, 12, 10, 9, 9, 9, 10, 11, 11],
    continentality: 0.7,
  },
  {
    id: "rhone",
    name: "Vallee du Rhone",
    macroArea: "Sud-Est",
    center: [4.83, 44.5],
    blurb:
      "Climat a forte influence mediterraneenne au sud. Etes chauds et secs, mistral marque, pluies automnales intenses.",
    tMaxMean: 20.1,
    tMinMean: 10.2,
    tMaxAmp: 9.2,
    tMinAmp: 7.0,
    warmingPerYear: 0.05,
    monthlyRainMm: [56, 46, 46, 56, 60, 42, 26, 42, 92, 112, 92, 70],
    monthlyRainDays: [7, 6, 7, 8, 8, 6, 4, 5, 7, 8, 8, 7],
    continentality: 0.4,
  },
];

export const WINE_REGIONS: WineRegion[] = REGION_BASELINES.map((r) => ({
  id: r.id,
  name: r.name,
  macroArea: r.macroArea,
  center: r.center,
  blurb: r.blurb,
}));

export function getRegionBaseline(id: string): RegionBaseline | undefined {
  return REGION_BASELINES.find((r) => r.id === id);
}

export function getRegion(id: string): WineRegion | undefined {
  return WINE_REGIONS.find((r) => r.id === id);
}

/**
 * Rough editorial footprints for the three V1 regions. These are simplified
 * polygons for demonstration — replace with official geometries (PostGIS) later.
 */
export const REGIONS_GEOJSON: FeatureCollection<Polygon, { id: string; name: string }> = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { id: "bordeaux", name: "Bordeaux" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-1.05, 44.55],
            [-0.95, 45.3],
            [-0.35, 45.45],
            [0.15, 45.0],
            [0.05, 44.5],
            [-0.55, 44.3],
            [-1.05, 44.55],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: { id: "bourgogne", name: "Bourgogne" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [4.45, 46.6],
            [4.55, 47.55],
            [5.0, 47.6],
            [5.25, 47.0],
            [5.0, 46.55],
            [4.6, 46.5],
            [4.45, 46.6],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: { id: "rhone", name: "Vallee du Rhone" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [4.55, 43.9],
            [4.6, 45.3],
            [5.0, 45.35],
            [5.25, 44.2],
            [5.1, 43.85],
            [4.7, 43.8],
            [4.55, 43.9],
          ],
        ],
      },
    },
  ],
};
