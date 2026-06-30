/**
 * Region metadata + climate baselines used by the synthetic data generator,
 * plus approximate GeoJSON footprints for the map.
 *
 * NOTE: These baselines drive SYNTHETIC demo data only. Real Météo-France data
 * will replace the generated series via the ingestion pipeline (see
 * `scripts/fetch_meteo_france_open_data.py`,
 * `scripts/import_meteo_france_to_supabase.py`, and `docs/data-sources.md`).
 * The geometries here are rough editorial footprints, NOT official AOC
 * boundaries.
 */

import type { WineRegion } from "@/lib/types";
import type { FeatureCollection, MultiPolygon } from "geojson";

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

function mpoly(rings: number[][][]): MultiPolygon {
  return {
    type: "MultiPolygon",
    coordinates: rings.map((ring) => [ring]),
  };
}

/**
 * Rough editorial footprints for the twelve V1 regions. These are simplified
 * MultiPolygons for demonstration - replace with official geometries
 * (PostGIS) later.
 */
export const REGION_GEOMETRIES: Record<string, MultiPolygon> = {
  bordeaux: mpoly([
    [
      [-1.10, 45.62],
      [-0.96, 45.72],
      [-0.76, 45.60],
      [-0.62, 45.30],
      [-0.68, 45.08],
      [-0.84, 45.08],
      [-0.98, 45.30],
      [-1.10, 45.62],
    ],
    [
      [-0.74, 44.98],
      [-0.56, 45.00],
      [-0.38, 44.80],
      [-0.26, 44.52],
      [-0.34, 44.24],
      [-0.52, 44.28],
      [-0.66, 44.56],
      [-0.74, 44.98],
    ],
    [
      [-0.50, 44.56],
      [-0.34, 44.66],
      [-0.16, 44.58],
      [-0.14, 44.40],
      [-0.30, 44.32],
      [-0.46, 44.40],
      [-0.50, 44.56],
    ],
    [
      [-0.52, 44.90],
      [-0.18, 45.06],
      [0.16, 44.96],
      [0.30, 44.74],
      [0.12, 44.52],
      [-0.18, 44.48],
      [-0.42, 44.62],
      [-0.52, 44.90],
    ],
    [
      [-0.30, 44.94],
      [-0.14, 45.10],
      [0.12, 45.12],
      [0.26, 44.98],
      [0.20, 44.80],
      [0.02, 44.74],
      [-0.18, 44.78],
      [-0.30, 44.94],
    ],
    [
      [-0.66, 45.10],
      [-0.52, 45.24],
      [-0.30, 45.24],
      [-0.22, 45.12],
      [-0.34, 44.98],
      [-0.56, 44.98],
      [-0.66, 45.10],
    ],
  ]),
  bourgogne: mpoly([
    [
      [3.56, 47.92],
      [3.78, 48.02],
      [4.02, 47.94],
      [4.00, 47.70],
      [3.72, 47.62],
      [3.56, 47.75],
      [3.56, 47.92],
    ],
    [
      [4.82, 47.30],
      [5.02, 47.30],
      [5.00, 47.05],
      [4.88, 47.00],
      [4.80, 47.10],
      [4.82, 47.30],
    ],
    [
      [4.72, 47.05],
      [4.90, 47.02],
      [4.88, 46.82],
      [4.72, 46.80],
      [4.66, 46.92],
      [4.72, 47.05],
    ],
    [
      [4.62, 46.82],
      [4.84, 46.80],
      [4.82, 46.56],
      [4.64, 46.52],
      [4.56, 46.66],
      [4.62, 46.82],
    ],
    [
      [4.58, 46.55],
      [4.92, 46.52],
      [4.94, 46.18],
      [4.72, 46.08],
      [4.52, 46.18],
      [4.50, 46.38],
      [4.58, 46.55],
    ],
  ]),
  rhone: mpoly([
    [
      [4.72, 45.60],
      [4.90, 45.54],
      [4.96, 45.30],
      [4.86, 45.02],
      [4.70, 45.02],
      [4.62, 45.28],
      [4.66, 45.48],
      [4.72, 45.60],
    ],
    [
      [4.34, 44.58],
      [4.74, 44.60],
      [5.10, 44.36],
      [5.22, 44.08],
      [5.10, 43.86],
      [4.84, 43.82],
      [4.50, 43.90],
      [4.30, 44.12],
      [4.28, 44.38],
      [4.34, 44.58],
    ],
  ]),
  alsace: mpoly([
    [
      [7.28, 48.64],
      [7.42, 48.64],
      [7.38, 48.42],
      [7.26, 48.34],
      [7.20, 48.46],
      [7.28, 48.64],
    ],
    [
      [7.18, 48.30],
      [7.34, 48.30],
      [7.32, 48.06],
      [7.18, 47.96],
      [7.08, 48.12],
      [7.18, 48.30],
    ],
    [
      [7.08, 47.92],
      [7.24, 47.94],
      [7.20, 47.64],
      [7.04, 47.52],
      [6.96, 47.70],
      [7.08, 47.92],
    ],
  ]),
  champagne: mpoly([
    [
      [3.50, 49.30],
      [4.18, 49.30],
      [4.54, 49.10],
      [4.40, 48.84],
      [3.94, 48.78],
      [3.52, 48.94],
      [3.50, 49.30],
    ],
    [
      [3.48, 48.96],
      [3.96, 49.00],
      [4.14, 48.74],
      [4.02, 48.48],
      [3.64, 48.50],
      [3.42, 48.70],
      [3.48, 48.96],
    ],
    [
      [3.84, 48.34],
      [4.32, 48.36],
      [4.64, 48.14],
      [4.58, 47.92],
      [4.10, 47.90],
      [3.82, 48.06],
      [3.84, 48.34],
    ],
  ]),
  loire: mpoly([
    [
      [-2.12, 47.02],
      [-1.94, 47.22],
      [-1.70, 47.30],
      [-1.46, 47.34],
      [-1.20, 47.28],
      [-1.08, 47.14],
      [-1.16, 46.96],
      [-1.44, 46.88],
      [-1.78, 46.88],
      [-2.02, 46.94],
      [-2.12, 47.02],
    ],
    [
      [-1.02, 47.26],
      [-0.70, 47.50],
      [-0.28, 47.54],
      [0.10, 47.48],
      [0.36, 47.30],
      [0.30, 47.08],
      [0.02, 46.96],
      [-0.34, 46.86],
      [-0.72, 46.98],
      [-0.94, 47.10],
      [-1.02, 47.26],
    ],
    [
      [0.24, 47.24],
      [0.62, 47.50],
      [1.10, 47.54],
      [1.56, 47.46],
      [1.76, 47.28],
      [1.70, 47.08],
      [1.36, 46.94],
      [0.92, 46.86],
      [0.48, 47.00],
      [0.24, 47.24],
    ],
    [
      [1.70, 47.82],
      [2.10, 47.90],
      [2.52, 47.78],
      [2.96, 47.54],
      [3.16, 47.30],
      [3.08, 47.12],
      [2.70, 47.10],
      [2.36, 46.96],
      [2.06, 46.62],
      [1.88, 46.58],
      [1.78, 46.82],
      [1.86, 47.18],
      [1.68, 47.48],
      [1.70, 47.82],
    ],
  ]),
  corse: mpoly([
    [
      [8.70, 42.96],
      [9.08, 43.00],
      [9.20, 42.82],
      [9.10, 42.58],
      [8.84, 42.52],
      [8.66, 42.70],
      [8.70, 42.96],
    ],
    [
      [8.84, 42.48],
      [9.22, 42.54],
      [9.34, 42.24],
      [9.24, 41.92],
      [8.98, 41.84],
      [8.80, 42.02],
      [8.84, 42.48],
    ],
    [
      [8.60, 41.86],
      [8.98, 41.88],
      [9.10, 41.60],
      [8.96, 41.36],
      [8.70, 41.34],
      [8.54, 41.54],
      [8.60, 41.86],
    ],
  ]),
  provence: mpoly([
    [
      [4.88, 43.82],
      [5.24, 43.88],
      [5.40, 43.74],
      [5.28, 43.56],
      [4.96, 43.58],
      [4.84, 43.68],
      [4.88, 43.82],
    ],
    [
      [5.26, 43.86],
      [5.84, 43.92],
      [6.22, 43.82],
      [6.18, 43.54],
      [5.78, 43.38],
      [5.36, 43.46],
      [5.22, 43.64],
      [5.26, 43.86],
    ],
    [
      [6.12, 43.84],
      [6.72, 43.88],
      [7.14, 43.70],
      [7.10, 43.42],
      [6.72, 43.26],
      [6.26, 43.30],
      [6.02, 43.54],
      [6.12, 43.84],
    ],
  ]),
  beaujolais: mpoly([
    [
      [4.40, 46.02],
      [4.74, 46.00],
      [4.86, 45.88],
      [4.78, 45.76],
      [4.46, 45.78],
      [4.36, 45.90],
      [4.40, 46.02],
    ],
    [
      [4.50, 45.78],
      [4.84, 45.76],
      [4.94, 45.60],
      [4.78, 45.48],
      [4.52, 45.54],
      [4.42, 45.66],
      [4.50, 45.78],
    ],
  ]),
  jura: mpoly([
    [
      [5.36, 47.28],
      [5.68, 47.30],
      [5.82, 47.10],
      [5.70, 46.90],
      [5.42, 46.92],
      [5.32, 47.08],
      [5.36, 47.28],
    ],
    [
      [5.46, 46.88],
      [5.78, 46.86],
      [5.92, 46.64],
      [5.84, 46.42],
      [5.58, 46.40],
      [5.40, 46.58],
      [5.46, 46.88],
    ],
  ]),
  savoie: mpoly([
    [
      [5.94, 45.70],
      [6.20, 45.78],
      [6.28, 45.64],
      [6.16, 45.50],
      [5.96, 45.54],
      [5.90, 45.64],
      [5.94, 45.70],
    ],
    [
      [6.02, 45.58],
      [6.48, 45.64],
      [6.82, 45.52],
      [6.92, 45.72],
      [6.76, 45.96],
      [6.42, 46.00],
      [6.10, 45.86],
      [6.02, 45.58],
    ],
    [
      [6.12, 46.04],
      [6.46, 46.10],
      [6.68, 46.02],
      [6.66, 45.88],
      [6.34, 45.86],
      [6.10, 45.92],
      [6.12, 46.04],
    ],
  ]),
  "languedoc-roussillon": mpoly([
    [
      [3.90, 44.18],
      [4.20, 44.10],
      [4.18, 43.82],
      [3.96, 43.72],
      [3.72, 43.80],
      [3.72, 44.04],
      [3.90, 44.18],
    ],
    [
      [3.14, 43.92],
      [3.58, 43.96],
      [3.84, 43.82],
      [3.76, 43.54],
      [3.38, 43.44],
      [3.12, 43.56],
      [3.14, 43.92],
    ],
    [
      [2.44, 43.70],
      [2.96, 43.78],
      [3.18, 43.54],
      [3.00, 43.24],
      [2.58, 43.16],
      [2.34, 43.34],
      [2.44, 43.70],
    ],
    [
      [2.18, 42.86],
      [2.62, 42.96],
      [2.94, 42.80],
      [3.02, 42.54],
      [2.74, 42.38],
      [2.34, 42.42],
      [2.12, 42.60],
      [2.18, 42.86],
    ],
  ]),
};

/**
 * Rough editorial footprints for the twelve V1 regions. These are simplified
 * polygons for demonstration — replace with official geometries (PostGIS) later.
 */
export const REGIONS_GEOJSON: FeatureCollection<MultiPolygon, { id: string; name: string }> = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: { id: "bordeaux", name: "Bordeaux" }, geometry: REGION_GEOMETRIES.bordeaux },
    { type: "Feature", properties: { id: "bourgogne", name: "Bourgogne" }, geometry: REGION_GEOMETRIES.bourgogne },
    { type: "Feature", properties: { id: "rhone", name: "Vallee du Rhone" }, geometry: REGION_GEOMETRIES.rhone },
    { type: "Feature", properties: { id: "alsace", name: "Alsace" }, geometry: REGION_GEOMETRIES.alsace },
    { type: "Feature", properties: { id: "champagne", name: "Champagne" }, geometry: REGION_GEOMETRIES.champagne },
    { type: "Feature", properties: { id: "loire", name: "Loire" }, geometry: REGION_GEOMETRIES.loire },
    { type: "Feature", properties: { id: "corse", name: "Corse" }, geometry: REGION_GEOMETRIES.corse },
    { type: "Feature", properties: { id: "provence", name: "Provence" }, geometry: REGION_GEOMETRIES.provence },
    { type: "Feature", properties: { id: "beaujolais", name: "Beaujolais" }, geometry: REGION_GEOMETRIES.beaujolais },
    { type: "Feature", properties: { id: "jura", name: "Jura" }, geometry: REGION_GEOMETRIES.jura },
    { type: "Feature", properties: { id: "savoie", name: "Savoie" }, geometry: REGION_GEOMETRIES.savoie },
    {
      type: "Feature",
      properties: { id: "languedoc-roussillon", name: "Languedoc-Roussillon" },
      geometry: REGION_GEOMETRIES["languedoc-roussillon"],
    },
  ],
};
