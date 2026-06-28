/**
 * Hierarchical wine-area model (the navigation tree for the map).
 *
 * This is the SEED tree: realistic but intentionally INCOMPLETE and marked
 * `provisional` below level 1. The hierarchy is deliberately NON-uniform — each
 * branch only goes as deep as we have meaningful divisions for it today.
 *
 * Contours live in `src/data/geo.ts` (keyed by `geoJsonId`); business data
 * lives in `src/data/synthetic.ts` (climate), `soils.ts`, `scores.ts`. Climate
 * stays MACRO (regional) for now: sub-areas inherit it via `rootRegionId`.
 *
 * See `docs/wine-hierarchy.md` for how to add a region / sous-région / village
 * / cru / parcelle and where to plug fine soils, météo and parcellaire later.
 */

import type { AreaLevel, RegionType, WineArea } from "@/lib/types";
import { REGION_BASELINES } from "./regions";

/**
 * Default zoom band per level, used both for the model and to drive the map's
 * progressive layer reveal. Bands overlap slightly for smooth transitions.
 */
export const LEVEL_ZOOM: Record<AreaLevel, { min: number; max: number }> = {
  1: { min: 0, max: 8 },
  2: { min: 7, max: 10.5 },
  3: { min: 9.5, max: 22 },
  4: { min: 10.5, max: 22 },
  5: { min: 12, max: 22 },
};

/** Human labels for the editorial classification (UI display). */
export const REGION_TYPE_LABELS: Record<RegionType, string> = {
  region: "Région",
  subregion: "Sous-région",
  zone: "Zone",
  village: "Village",
  appellation: "Appellation",
  "premier-cru": "Premier Cru",
  "grand-cru": "Grand Cru",
  "lieu-dit": "Lieu-dit",
  parcelle: "Parcelle",
};

/**
 * Shorthand to declare a seed sub-area. Zoom band defaults to its level unless
 * overridden. `geoJsonId` defaults to `id` (set to `null` when no contour yet).
 */
function area(
  partial: Omit<WineArea, "zoomMin" | "zoomMax" | "geoJsonId" | "provisional"> &
    Partial<Pick<WineArea, "zoomMin" | "zoomMax" | "geoJsonId" | "provisional">>
): WineArea {
  const band = LEVEL_ZOOM[partial.level];
  return {
    provisional: true,
    geoJsonId: partial.id,
    zoomMin: band.min,
    zoomMax: band.max,
    ...partial,
  };
}

/** Level-1 regions are derived from the existing baselines (single source). */
const LEVEL1: WineArea[] = REGION_BASELINES.map((r) => ({
  id: r.id,
  name: r.name,
  level: 1 as AreaLevel,
  parentId: null,
  rootRegionId: r.id,
  regionType: "region" as RegionType,
  geoJsonId: r.id,
  center: r.center,
  zoomMin: LEVEL_ZOOM[1].min,
  zoomMax: LEVEL_ZOOM[1].max,
  availableDataScopes: ["climate", "soils", "scores", "vintages"],
  blurb: r.blurb,
  provisional: false,
}));

/* -------------------------------------------------------------------------- */
/* Seed sub-areas (provisional). Non-uniform on purpose.                      */
/* -------------------------------------------------------------------------- */

const ALSACE: WineArea[] = [
  area({
    id: "alsace-grand-cru",
    name: "Alsace Grand Cru",
    level: 2,
    parentId: "alsace",
    rootRegionId: "alsace",
    regionType: "grand-cru",
    center: [7.28, 48.2],
    // Soils can legitimately differ at the Grand Cru level: seed available.
    availableDataScopes: ["soils"],
    blurb:
      "Coteaux délimités des Grands Crus alsaciens (lieux-dits à venir).",
  }),
];

const BOURGOGNE: WineArea[] = [
  area({ id: "cote-de-nuits", name: "Côte de Nuits", level: 2, parentId: "bourgogne", rootRegionId: "bourgogne", regionType: "subregion", center: [4.95, 47.15], availableDataScopes: [] }),
  area({ id: "cote-de-beaune", name: "Côte de Beaune", level: 2, parentId: "bourgogne", rootRegionId: "bourgogne", regionType: "subregion", center: [4.78, 46.97], availableDataScopes: [] }),
  area({ id: "cote-chalonnaise", name: "Côte Chalonnaise", level: 2, parentId: "bourgogne", rootRegionId: "bourgogne", regionType: "subregion", center: [4.7, 46.72], availableDataScopes: [] }),
  area({ id: "maconnais", name: "Mâconnais", level: 2, parentId: "bourgogne", rootRegionId: "bourgogne", regionType: "subregion", center: [4.78, 46.4], availableDataScopes: [] }),
  // Chablis has no contour yet -> point-only node (demonstrates fallback).
  area({ id: "chablis", name: "Chablis", level: 2, parentId: "bourgogne", rootRegionId: "bourgogne", regionType: "subregion", center: [3.8, 47.81], geoJsonId: null, availableDataScopes: [] }),
  // Village + crus under Côte de Beaune (example chain Meursault > 1er Cru > Perrières).
  area({ id: "meursault", name: "Meursault", level: 3, parentId: "cote-de-beaune", rootRegionId: "bourgogne", regionType: "village", center: [4.77, 46.98], availableDataScopes: [] }),
  area({ id: "meursault-1er-cru-perrieres", name: "Meursault 1er Cru Les Perrières", level: 4, parentId: "meursault", rootRegionId: "bourgogne", regionType: "premier-cru", center: [4.762, 46.972], geoJsonId: null, availableDataScopes: ["soils"], blurb: "Climat de référence en 1er Cru (parcellaire à venir)." }),
  area({ id: "montrachet", name: "Montrachet (Grand Cru)", level: 3, parentId: "cote-de-beaune", rootRegionId: "bourgogne", regionType: "grand-cru", center: [4.735, 46.94], availableDataScopes: [] }),
];

const BORDEAUX: WineArea[] = [
  area({ id: "medoc", name: "Médoc", level: 2, parentId: "bordeaux", rootRegionId: "bordeaux", regionType: "subregion", center: [-0.73, 45.18], availableDataScopes: [] }),
  area({ id: "graves-pessac-leognan", name: "Graves / Pessac-Léognan", level: 2, parentId: "bordeaux", rootRegionId: "bordeaux", regionType: "subregion", center: [-0.55, 44.72], availableDataScopes: [] }),
  area({ id: "sauternais", name: "Sauternais", level: 2, parentId: "bordeaux", rootRegionId: "bordeaux", regionType: "subregion", center: [-0.32, 44.5], availableDataScopes: [] }),
  area({ id: "entre-deux-mers", name: "Entre-deux-Mers", level: 2, parentId: "bordeaux", rootRegionId: "bordeaux", regionType: "subregion", center: [-0.2, 44.78], availableDataScopes: [] }),
  area({ id: "libournais", name: "Rive droite (Libournais)", level: 2, parentId: "bordeaux", rootRegionId: "bordeaux", regionType: "subregion", center: [-0.08, 44.93], availableDataScopes: [] }),
  area({ id: "cotes-de-bourg", name: "Côtes de Bourg", level: 2, parentId: "bordeaux", rootRegionId: "bordeaux", regionType: "subregion", center: [-0.49, 45.1], availableDataScopes: [] }),
  area({ id: "pauillac", name: "Pauillac", level: 3, parentId: "medoc", rootRegionId: "bordeaux", regionType: "appellation", center: [-0.73, 45.2], availableDataScopes: [] }),
  area({ id: "saint-emilion", name: "Saint-Émilion", level: 3, parentId: "libournais", rootRegionId: "bordeaux", regionType: "appellation", center: [-0.13, 44.89], availableDataScopes: [] }),
  area({ id: "saint-emilion-grand-cru", name: "Saint-Émilion Grand Cru", level: 4, parentId: "saint-emilion", rootRegionId: "bordeaux", regionType: "grand-cru", center: [-0.15, 44.9], geoJsonId: null, availableDataScopes: [] }),
];

const RHONE: WineArea[] = [
  area({ id: "rhone-septentrional", name: "Rhône septentrional", level: 2, parentId: "rhone", rootRegionId: "rhone", regionType: "subregion", center: [4.83, 45.1], availableDataScopes: [], blurb: "Septentrional : granites/schistes, climat plus continental." }),
  area({ id: "rhone-meridional", name: "Rhône méridional", level: 2, parentId: "rhone", rootRegionId: "rhone", regionType: "subregion", center: [4.85, 44.1], availableDataScopes: [], blurb: "Méridional : influence méditerranéenne, galets roulés." }),
];

const LOIRE: WineArea[] = [
  area({ id: "pays-nantais", name: "Pays nantais", level: 2, parentId: "loire", rootRegionId: "loire", regionType: "subregion", center: [-0.78, 47.2], availableDataScopes: [] }),
  area({ id: "anjou-saumur", name: "Anjou-Saumur", level: 2, parentId: "loire", rootRegionId: "loire", regionType: "subregion", center: [-0.25, 47.3], availableDataScopes: [] }),
  area({ id: "touraine", name: "Touraine", level: 2, parentId: "loire", rootRegionId: "loire", regionType: "subregion", center: [0.8, 47.3], availableDataScopes: [] }),
  area({ id: "centre-loire", name: "Centre-Loire (Sancerrois)", level: 2, parentId: "loire", rootRegionId: "loire", regionType: "subregion", center: [1.5, 47.4], availableDataScopes: [] }),
];

export const WINE_AREAS: WineArea[] = [
  ...LEVEL1,
  ...ALSACE,
  ...BOURGOGNE,
  ...BORDEAUX,
  ...RHONE,
  ...LOIRE,
];

/* -------------------------------------------------------------------------- */
/* Lookups & tree helpers                                                     */
/* -------------------------------------------------------------------------- */

const BY_ID = new Map<string, WineArea>(WINE_AREAS.map((a) => [a.id, a]));

export function getArea(id: string | null | undefined): WineArea | undefined {
  return id ? BY_ID.get(id) : undefined;
}

/** Direct children of an area (one level down). */
export function getChildren(id: string): WineArea[] {
  return WINE_AREAS.filter((a) => a.parentId === id);
}

export function hasChildren(id: string): boolean {
  return WINE_AREAS.some((a) => a.parentId === id);
}

/** Ancestors from the root region down to (but excluding) the area itself. */
export function getAncestors(id: string): WineArea[] {
  const chain: WineArea[] = [];
  let current = getArea(id);
  while (current?.parentId) {
    const parent = getArea(current.parentId);
    if (!parent) break;
    chain.unshift(parent);
    current = parent;
  }
  return chain;
}

/** The level-1 region an area belongs to. */
export function getRootRegion(id: string): WineArea | undefined {
  const a = getArea(id);
  return a ? getArea(a.rootRegionId) : undefined;
}

/** Areas that should be considered "active" at a given map zoom. */
export function getAreasForZoom(zoom: number): WineArea[] {
  return WINE_AREAS.filter(
    (a) => zoom >= a.zoomMin && (a.zoomMax === 0 || zoom <= a.zoomMax)
  );
}
