/**
 * Geographic contours, kept SEPARATE from business/hierarchy metadata.
 *
 * `src/data/areas.ts` owns the hierarchy (ids, levels, parents, data scopes).
 * This file owns ONLY geometry, keyed by `WineArea.geoJsonId`. The map merges
 * the two at runtime. Keeping them apart lets contours evolve (better shapes,
 * official AOC limits, TopoJSON, per-level files…) without touching the model.
 *
 * IMPORTANT: every polygon here is a ROUGH EDITORIAL FOOTPRINT for display, NOT
 * an official AOC boundary. They are deliberately simplified. Replace them with
 * sourced geometries (PostGIS / IGN / official AOC) later — see
 * `docs/wine-hierarchy.md`.
 *
 * To add a contour: add an entry keyed by the area's `geoJsonId`. To add a
 * whole new level later, you can split this into per-level GeoJSON/TopoJSON
 * files and load them lazily; the map already drives visibility by zoom.
 */

import type { Polygon } from "geojson";
import { REGIONS_GEOJSON } from "./regions";

/** A premium-ish, low-saturation hue per level-1 region (map styling). */
export const REGION_COLORS: Record<string, string> = {
  bordeaux: "#8c3b4a",
  bourgogne: "#7a3f8c",
  rhone: "#b4623a",
  alsace: "#3f8a6b",
  champagne: "#c2a13a",
  loire: "#4a86a8",
  corse: "#5f9e6a",
  provence: "#b07aa1",
  beaujolais: "#a8455a",
  jura: "#5a8a8a",
  savoie: "#6a8ab0",
  "languedoc-roussillon": "#c0744a",
};

/** Fallback colour for any area whose root region is unknown. */
export const DEFAULT_AREA_COLOR = "#8c5a3b";

function poly(coords: number[][]): Polygon {
  return { type: "Polygon", coordinates: [coords] };
}

/**
 * Rough editorial footprints below level 1 (sous-régions, zones, villages,
 * crus). Level-1 footprints are reused from `REGIONS_GEOJSON`. NOT official.
 */
const SUBAREA_GEOMETRIES: Record<string, Polygon> = {
  // --- Bordeaux ------------------------------------------------------------
  medoc: poly([
    [-0.95, 45.05], [-0.9, 45.35], [-0.65, 45.4], [-0.55, 45.1], [-0.7, 44.95], [-0.95, 45.05],
  ]),
  "graves-pessac-leognan": poly([
    [-0.7, 44.6], [-0.65, 44.85], [-0.45, 44.85], [-0.4, 44.6], [-0.55, 44.5], [-0.7, 44.6],
  ]),
  sauternais: poly([
    [-0.45, 44.45], [-0.42, 44.6], [-0.25, 44.62], [-0.2, 44.45], [-0.32, 44.38], [-0.45, 44.45],
  ]),
  "entre-deux-mers": poly([
    [-0.45, 44.7], [-0.4, 44.95], [-0.05, 44.95], [0.05, 44.7], [-0.15, 44.55], [-0.45, 44.7],
  ]),
  libournais: poly([
    [-0.25, 44.85], [-0.2, 45.05], [0.05, 45.05], [0.1, 44.85], [-0.05, 44.78], [-0.25, 44.85],
  ]),
  "cotes-de-bourg": poly([
    [-0.6, 45.0], [-0.58, 45.18], [-0.4, 45.2], [-0.38, 45.02], [-0.5, 44.95], [-0.6, 45.0],
  ]),
  pauillac: poly([
    [-0.78, 45.16], [-0.77, 45.24], [-0.69, 45.25], [-0.68, 45.17], [-0.73, 45.14], [-0.78, 45.16],
  ]),
  "saint-emilion": poly([
    [-0.18, 44.87], [-0.17, 44.92], [-0.1, 44.92], [-0.09, 44.87], [-0.13, 44.85], [-0.18, 44.87],
  ]),

  // --- Bourgogne -----------------------------------------------------------
  "cote-de-nuits": poly([
    [4.9, 47.05], [4.92, 47.22], [5.02, 47.23], [5.0, 47.06], [4.95, 47.02], [4.9, 47.05],
  ]),
  "cote-de-beaune": poly([
    [4.72, 46.9], [4.74, 47.02], [4.86, 47.03], [4.85, 46.9], [4.78, 46.86], [4.72, 46.9],
  ]),
  "cote-chalonnaise": poly([
    [4.64, 46.62], [4.66, 46.8], [4.78, 46.8], [4.78, 46.62], [4.7, 46.58], [4.64, 46.62],
  ]),
  maconnais: poly([
    [4.7, 46.3], [4.72, 46.5], [4.86, 46.5], [4.86, 46.3], [4.78, 46.26], [4.7, 46.3],
  ]),
  meursault: poly([
    [4.74, 46.96], [4.745, 47.0], [4.79, 47.0], [4.79, 46.96], [4.77, 46.94], [4.74, 46.96],
  ]),
  montrachet: poly([
    [4.725, 46.93], [4.728, 46.95], [4.745, 46.95], [4.747, 46.93], [4.735, 46.92], [4.725, 46.93],
  ]),

  // --- Alsace --------------------------------------------------------------
  "alsace-grand-cru": poly([
    [7.2, 48.05], [7.22, 48.45], [7.34, 48.46], [7.36, 48.06], [7.28, 48.02], [7.2, 48.05],
  ]),

  // --- Rhône ---------------------------------------------------------------
  "rhone-septentrional": poly([
    [4.7, 44.9], [4.72, 45.3], [4.95, 45.32], [4.98, 44.92], [4.85, 44.85], [4.7, 44.9],
  ]),
  "rhone-meridional": poly([
    [4.6, 43.85], [4.62, 44.4], [5.1, 44.42], [5.18, 43.95], [4.9, 43.82], [4.6, 43.85],
  ]),

  // --- Loire ---------------------------------------------------------------
  "pays-nantais": poly([
    [-0.95, 47.05], [-0.93, 47.35], [-0.65, 47.37], [-0.6, 47.08], [-0.78, 47.0], [-0.95, 47.05],
  ]),
  "anjou-saumur": poly([
    [-0.5, 47.15], [-0.48, 47.45], [-0.05, 47.46], [0.0, 47.2], [-0.2, 47.1], [-0.5, 47.15],
  ]),
  touraine: poly([
    [0.5, 47.15], [0.52, 47.5], [1.1, 47.5], [1.15, 47.2], [0.85, 47.08], [0.5, 47.15],
  ]),
  "centre-loire": poly([
    [1.3, 47.25], [1.32, 47.6], [1.65, 47.62], [1.68, 47.3], [1.5, 47.2], [1.3, 47.25],
  ]),
};

/**
 * All contours, keyed by `geoJsonId`. Level-1 reuses the existing region
 * footprints so there is a single source of truth for region shapes.
 */
export const AREA_GEOMETRIES: Record<string, Polygon> = {
  ...Object.fromEntries(
    REGIONS_GEOJSON.features.map((f) => [f.properties.id, f.geometry])
  ),
  ...SUBAREA_GEOMETRIES,
};

export function getAreaGeometry(geoJsonId: string | null): Polygon | undefined {
  if (!geoJsonId) return undefined;
  return AREA_GEOMETRIES[geoJsonId];
}
