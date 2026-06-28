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
  {
    id: "alsace",
    name: "Alsace",
    macroArea: "Nord-Est",
    center: [7.35, 48.25],
    blurb:
      "Climat semi-continental sec, abrite par les Vosges. Etes chauds et ensoleilles, pluies plus faibles que la moyenne.",
    tMaxMean: 17.0,
    tMinMean: 7.0,
    tMaxAmp: 10.2,
    tMinAmp: 8.8,
    warmingPerYear: 0.05,
    monthlyRainMm: [45, 40, 42, 48, 58, 56, 50, 52, 55, 60, 55, 50],
    monthlyRainDays: [8, 7, 7, 8, 9, 8, 7, 7, 7, 8, 8, 8],
    continentality: 0.82,
  },
  {
    id: "champagne",
    name: "Champagne",
    macroArea: "Nord-Est",
    center: [4.05, 49.05],
    blurb:
      "Climat frais a tendance continentale, avec risques de gel au printemps et pluies bien reparties.",
    tMaxMean: 15.2,
    tMinMean: 6.0,
    tMaxAmp: 9.0,
    tMinAmp: 8.0,
    warmingPerYear: 0.045,
    monthlyRainMm: [55, 48, 48, 54, 66, 62, 58, 56, 58, 62, 60, 58],
    monthlyRainDays: [12, 10, 10, 11, 12, 11, 10, 10, 10, 11, 11, 11],
    continentality: 0.78,
  },
  {
    id: "loire",
    name: "Loire",
    macroArea: "Ouest / Centre",
    center: [0.6, 47.3],
    blurb:
      "Climat oceanique tempere, plus continental vers l'est. Pluies reparties et printemps sensibles au gel.",
    tMaxMean: 17.6,
    tMinMean: 8.3,
    tMaxAmp: 8.8,
    tMinAmp: 7.3,
    warmingPerYear: 0.045,
    monthlyRainMm: [60, 52, 50, 55, 62, 54, 44, 46, 52, 66, 68, 64],
    monthlyRainDays: [11, 9, 9, 10, 10, 9, 7, 7, 8, 10, 11, 11],
    continentality: 0.45,
  },
  {
    id: "corse",
    name: "Corse",
    macroArea: "Mediterranee",
    center: [9.15, 42.18],
    blurb:
      "Climat mediterraneen maritime, tres ensoleille et ventile. Etes secs, forte amplitude locale entre cote et montagne.",
    tMaxMean: 19.3,
    tMinMean: 11.1,
    tMaxAmp: 8.0,
    tMinAmp: 6.3,
    warmingPerYear: 0.05,
    monthlyRainMm: [70, 58, 52, 48, 35, 22, 12, 18, 55, 90, 88, 78],
    monthlyRainDays: [9, 8, 7, 7, 6, 4, 2, 3, 5, 8, 9, 9],
    continentality: 0.3,
  },
  {
    id: "provence",
    name: "Provence",
    macroArea: "Sud-Est",
    center: [5.35, 43.55],
    blurb:
      "Climat mediterraneen chaud et tres sec l'ete, avec mistral et pluies d'automne marquees.",
    tMaxMean: 19.8,
    tMinMean: 10.0,
    tMaxAmp: 9.0,
    tMinAmp: 7.2,
    warmingPerYear: 0.05,
    monthlyRainMm: [48, 42, 44, 50, 48, 30, 18, 28, 72, 92, 76, 56],
    monthlyRainDays: [7, 6, 6, 7, 7, 5, 3, 4, 6, 8, 7, 7],
    continentality: 0.35,
  },
  {
    id: "beaujolais",
    name: "Beaujolais",
    macroArea: "Centre-Est",
    center: [4.67, 46.15],
    blurb:
      "Climat de transition entre Bourgogne et Rhone, avec influences continentales et episodes chauds d'ete.",
    tMaxMean: 16.7,
    tMinMean: 7.4,
    tMaxAmp: 9.3,
    tMinAmp: 7.8,
    warmingPerYear: 0.045,
    monthlyRainMm: [64, 58, 58, 66, 76, 70, 58, 56, 68, 74, 66, 64],
    monthlyRainDays: [11, 10, 10, 11, 11, 10, 8, 8, 9, 10, 11, 11],
    continentality: 0.62,
  },
  {
    id: "jura",
    name: "Jura",
    macroArea: "Est",
    center: [5.78, 46.82],
    blurb:
      "Climat frais et plus continental, avec fort risque de gel de printemps et pluies bien reparties.",
    tMaxMean: 15.0,
    tMinMean: 5.9,
    tMaxAmp: 9.8,
    tMinAmp: 8.4,
    warmingPerYear: 0.045,
    monthlyRainMm: [72, 66, 64, 72, 90, 88, 80, 76, 82, 90, 84, 80],
    monthlyRainDays: [12, 11, 11, 12, 13, 12, 11, 10, 11, 12, 12, 12],
    continentality: 0.74,
  },
  {
    id: "savoie",
    name: "Savoie",
    macroArea: "Alpes",
    center: [6.32, 45.55],
    blurb:
      "Climat alpin a influence montagnarde, frais et humide, avec fortes differences selon l'altitude.",
    tMaxMean: 14.6,
    tMinMean: 5.4,
    tMaxAmp: 10.0,
    tMinAmp: 8.7,
    warmingPerYear: 0.045,
    monthlyRainMm: [68, 62, 66, 82, 96, 90, 76, 74, 80, 86, 82, 76],
    monthlyRainDays: [12, 11, 11, 12, 13, 12, 11, 10, 11, 12, 12, 12],
    continentality: 0.68,
  },
  {
    id: "languedoc-roussillon",
    name: "Languedoc-Roussillon",
    macroArea: "Mediterranee",
    center: [3.45, 43.45],
    blurb:
      "Climat mediterraneen chaud et sec, avec forte luminosite et episodes pluvieux parfois intenses a l'automne.",
    tMaxMean: 20.4,
    tMinMean: 10.3,
    tMaxAmp: 9.4,
    tMinAmp: 7.4,
    warmingPerYear: 0.05,
    monthlyRainMm: [48, 40, 38, 46, 42, 26, 16, 24, 68, 96, 78, 58],
    monthlyRainDays: [7, 6, 6, 7, 6, 4, 2, 3, 5, 8, 7, 7],
    continentality: 0.32,
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
 * Rough editorial footprints for the twelve V1 regions. These are simplified
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
    {
      type: "Feature",
      properties: { id: "alsace", name: "Alsace" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [7.0, 48.4],
            [7.1, 49.0],
            [7.55, 49.1],
            [7.85, 48.5],
            [7.6, 48.1],
            [7.15, 48.0],
            [7.0, 48.4],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: { id: "champagne", name: "Champagne" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [3.4, 48.7],
            [3.6, 49.5],
            [4.5, 49.6],
            [4.8, 48.9],
            [4.5, 48.4],
            [3.8, 48.35],
            [3.4, 48.7],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: { id: "loire", name: "Loire" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-1.0, 46.3],
            [-0.6, 47.8],
            [0.4, 48.1],
            [1.4, 47.8],
            [1.7, 46.8],
            [0.8, 46.1],
            [-0.2, 46.0],
            [-1.0, 46.3],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: { id: "corse", name: "Corse" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [8.7, 41.8],
            [8.95, 42.8],
            [9.55, 42.9],
            [9.95, 42.15],
            [9.6, 41.3],
            [8.95, 41.2],
            [8.7, 41.8],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: { id: "provence", name: "Provence" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [4.4, 42.9],
            [4.6, 44.2],
            [6.0, 44.25],
            [6.35, 43.25],
            [5.7, 42.8],
            [4.9, 42.75],
            [4.4, 42.9],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: { id: "beaujolais", name: "Beaujolais" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [4.35, 45.7],
            [4.35, 46.5],
            [4.95, 46.55],
            [5.15, 45.95],
            [4.8, 45.6],
            [4.35, 45.7],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: { id: "jura", name: "Jura" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [5.45, 46.35],
            [5.45, 47.25],
            [6.15, 47.35],
            [6.4, 46.75],
            [6.0, 46.3],
            [5.45, 46.35],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: { id: "savoie", name: "Savoie" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [5.7, 45.0],
            [5.75, 45.95],
            [6.55, 46.05],
            [6.85, 45.45],
            [6.35, 44.95],
            [5.7, 45.0],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: { id: "languedoc-roussillon", name: "Languedoc-Roussillon" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [2.8, 42.4],
            [3.0, 43.9],
            [4.5, 44.1],
            [4.95, 43.1],
            [4.25, 42.3],
            [3.2, 42.2],
            [2.8, 42.4],
          ],
        ],
      },
    },
  ],
};
