/**
 * Real (MVT) wine-area hierarchy on the map, read progressively (ADR 0022):
 *
 *   zoom  5 ─ 7      région (fill + name)
 *   zoom  7 ─ 10     sous-régions / secteurs, one pastel each, one name each
 *   zoom 10 ─ 12.5   villages / appellations, one pastel each
 *   zoom 11 ─ 13     crus (premier = doré, grand = orange brique)
 *   zoom 13 +        planted vines, lieux-dits
 *
 * Each level fades in as the previous one fades to a faint wash, so the user
 * never zooms through a blank band (Mâconnais z11–13 before this). Only the
 * level **right above** the one being read keeps its outline, in a neutral
 * brown, with its name along it: région around the villages' secteurs no
 * more, secteur around the villages, village around the crus and vines.
 *
 * Colours: `map_color_idx` (migration 0017) picks a pastel so two touching
 * siblings never share one. Crus are a quality tier, not a place: one colour
 * per tier in every region.
 */
import type maplibregl from "maplibre-gl";
import type { Map as MlMap } from "maplibre-gl";
import type { WineLayerTheme } from "@/lib/basemaps";

type Expr = maplibregl.ExpressionSpecification;
const e = (x: unknown) => x as Expr;

/** Quality tiers (ADR 0022 — replaces the red of ADR 0012). */
export const GRAND_CRU_COLOR = "#b5532a"; // orange brique
export const PREMIER_CRU_COLOR = "#c9a133"; // doré
const GRAND_CRU_DARK = "#7c3114";
const PREMIER_CRU_DARK = "#6f5410";

/**
 * Pastel fills, after printed wine maps: rose, lilas, sauge, ciel, pêche,
 * beurre, menthe, mauve. `AREA_INK` is the same hue, dark enough for an
 * outline or a label.
 */
export const AREA_PALETTE = [
  "#ec9c9c", "#b49ce0", "#93c99a", "#8cbde6",
  "#f3b77e", "#e6d26c", "#86d1c0", "#d99cc6",
];
export const AREA_INK = [
  "#9c3a3a", "#5b3f99", "#2f7a3a", "#2b6596",
  "#a35a17", "#7d6a0c", "#1d7a66", "#8a3b74",
];

/**
 * Outline / edge-name colour of a level once its children are being read: a
 * coloured parent outline around differently coloured children (violet
 * Bourgogne around a pale yellow secteur) clashes. Parents are then told
 * apart by line width and name size, not by hue.
 */
export const PARENT_EDGE_COLOR = "#3d3530";

/** MVT source-layers carrying the hierarchy (migration 0017). */
export const AREA_SRC = {
  region: "wine-areas-region",
  appellation: "wine-areas-appellation",
  cru: "wine-areas-cru",
  labels: "wine-areas-labels",
} as const;

/** Interactive fills, bottom → top. */
export const AREA_FILL = {
  region: "real-fill-region",
  secteur: "real-fill-secteur",
  village: "real-fill-village",
  cru: "real-fill-cru",
} as const;

/** Zoom at which each level is the one being read (labels at its centre). */
export const AREA_BANDS = {
  region: { from: 0, to: 7.5 },
  secteur: { from: 7, to: 10.3 },
  village: { from: 9.6, to: 12.8 },
  cru: { from: 10.8, to: 22 },
} as const;

const isLevel = (...levels: number[]) =>
  e(["in", ["to-number", ["get", "level"]], ["literal", levels]]);

const tier = (grand: unknown, premier: unknown, other: unknown) =>
  e(["match", ["get", "region_type"], "grand-cru", grand, "premier-cru", premier, other]);

/** Pastel / ink by colour slot, region hue when the slot is missing. */
function slot(palette: string[], fallback: Expr | string): Expr {
  return e([
    "match",
    ["to-number", ["coalesce", ["get", "map_color_idx"], -1]],
    ...palette.flatMap((c, i) => [i, c]),
    fallback,
  ]);
}

const hoverSelect = (base: Expr | number, hover: number, selected: number) =>
  e([
    "case",
    ["boolean", ["feature-state", "selected"], false], selected,
    ["boolean", ["feature-state", "hover"], false], hover,
    base,
  ]);

/** `[zoom, opacity]` stops → interpolated, feature-state aware opacity. */
function fade(stops: [number, number][], hoverBoost = 0.14): Expr {
  return e([
    "interpolate", ["linear"], ["zoom"],
    ...stops.flatMap(([z, o]) => [
      z,
      hoverSelect(o, Math.min(o + hoverBoost, 0.7), Math.max(o, 0.5)),
    ]),
  ]);
}

/** Layer ids drawn by this module that handle their own theme. */
export const HIERARCHY_LAYERS = new Set<string>();

interface LineSpec {
  id: string;
  sourceLayer: string;
  filter?: maplibregl.FilterSpecification;
  minzoom: number;
  color: Expr | string;
  width: Expr;
  casing?: Expr;
  dash?: number[];
  /**
   * Zoom past which the outline fades out: only the level right above the
   * one being read keeps its outline (no stack of grandparent lines).
   */
  visibleUntil?: number;
}

/** Constant opacity, or a fade-out ending half a zoom after `until`. */
function lineOpacity(base: number, until?: number): Expr | number {
  if (until === undefined) return base;
  return e(["interpolate", ["linear"], ["zoom"], until, base, until + 0.5, 0]);
}

/**
 * Inks for labels and outlines, per basemap theme. Over imagery the
 * colour moves to the halo (white text on a coloured halo) — a dark label
 * on a dark photo does not read.
 */
interface InkLayer {
  id: string;
  ink: Expr | string;
  kind: "label" | "line" | "casing";
}
const INK_LAYERS: InkLayer[] = [];

function addLine(map: MlMap, spec: LineSpec) {
  if (spec.casing) {
    const casingId = `${spec.id}-casing`;
    map.addLayer({
      id: casingId,
      type: "line",
      source: "wine",
      "source-layer": spec.sourceLayer,
      minzoom: spec.minzoom,
      ...(spec.filter ? { filter: spec.filter } : {}),
      layout: { "line-join": "round" },
      ...(spec.visibleUntil !== undefined ? { maxzoom: spec.visibleUntil + 0.5 } : {}),
      paint: {
        "line-color": "#fbf7ef",
        "line-width": spec.casing,
        "line-opacity": lineOpacity(0.45, spec.visibleUntil),
      },
    });
    HIERARCHY_LAYERS.add(casingId);
    INK_LAYERS.push({ id: casingId, ink: "#fbf7ef", kind: "casing" });
  }
  map.addLayer({
    id: spec.id,
    type: "line",
    source: "wine",
    "source-layer": spec.sourceLayer,
    minzoom: spec.minzoom,
    ...(spec.visibleUntil !== undefined ? { maxzoom: spec.visibleUntil + 0.5 } : {}),
    ...(spec.filter ? { filter: spec.filter } : {}),
    layout: { "line-join": "round" },
    paint: {
      "line-color": spec.color,
      "line-width": spec.width,
      "line-opacity": lineOpacity(0.95, spec.visibleUntil),
      ...(spec.dash ? { "line-dasharray": spec.dash } : {}),
    },
  });
  HIERARCHY_LAYERS.add(spec.id);
  INK_LAYERS.push({ id: spec.id, ink: spec.color as Expr, kind: "line" });
}

interface LabelSpec {
  id: string;
  sourceLayer: string;
  filter?: maplibregl.FilterSpecification;
  minzoom: number;
  maxzoom?: number;
  text: Expr;
  size: Expr | number;
  ink: Expr | string;
  /** Name written along the outline instead of at the centre. */
  alongLine?: boolean;
  upper?: boolean;
  spacing?: number;
  sortKey?: Expr;
}

function addLabel(map: MlMap, spec: LabelSpec) {
  map.addLayer({
    id: spec.id,
    type: "symbol",
    source: "wine",
    "source-layer": spec.sourceLayer,
    minzoom: spec.minzoom,
    ...(spec.maxzoom !== undefined ? { maxzoom: spec.maxzoom } : {}),
    ...(spec.filter ? { filter: spec.filter } : {}),
    layout: {
      "text-field": spec.text,
      "text-size": spec.size,
      "text-font": ["Open Sans Semibold"],
      "text-allow-overlap": false,
      "text-padding": 4,
      ...(spec.upper ? { "text-transform": "uppercase", "text-letter-spacing": 0.08 } : {}),
      ...(spec.sortKey ? { "symbol-sort-key": spec.sortKey } : {}),
      ...(spec.alongLine
        ? {
            "symbol-placement": "line",
            "symbol-spacing": spec.spacing ?? 420,
            "text-max-angle": 30,
            "text-offset": [0, -0.7],
          }
        : { "text-max-width": 9 }),
    },
    paint: { "text-color": spec.ink, "text-halo-color": "#fbf7ef", "text-halo-width": 1.6 },
  });
  HIERARCHY_LAYERS.add(spec.id);
  INK_LAYERS.push({ id: spec.id, ink: spec.ink, kind: "label" });
}

/**
 * Fills of the four levels. Added low in the stack: parcels, lieux-dits and
 * vines draw over them. Returns the interactive layers, bottom → top.
 */
export function addAreaFills(map: MlMap, regionColor: Expr): { layerId: string; sourceLayer: string }[] {
  const pastel = slot(AREA_PALETTE, regionColor);
  const cruColor = tier(GRAND_CRU_COLOR, PREMIER_CRU_COLOR, pastel);

  map.addLayer({
    id: AREA_FILL.region,
    type: "fill",
    source: "wine",
    "source-layer": AREA_SRC.region,
    maxzoom: 11,
    paint: {
      "fill-color": regionColor,
      // Gone once the secteurs carry the colour: a violet wash under a pale
      // pastel turns it muddy.
      "fill-opacity": fade([[4, 0.22], [7, 0.16], [8.2, 0.03], [10, 0]]),
    },
  });
  // Sous-régions: the coarse reading, then a faint wash that still says
  // "you are in the Mâconnais" where no village / cru / vine is drawn.
  map.addLayer({
    id: AREA_FILL.secteur,
    type: "fill",
    source: "wine",
    "source-layer": AREA_SRC.appellation,
    filter: isLevel(2),
    paint: {
      "fill-color": tier(GRAND_CRU_COLOR, PREMIER_CRU_COLOR, pastel),
      "fill-opacity": fade([[7, 0.45], [9.6, 0.45], [10.8, 0.22], [13, 0.16], [14.5, 0.08]]),
    },
  });
  map.addLayer({
    id: AREA_FILL.village,
    type: "fill",
    source: "wine",
    "source-layer": AREA_SRC.appellation,
    minzoom: 9,
    filter: isLevel(3),
    paint: {
      "fill-color": pastel,
      "fill-opacity": fade([[9, 0], [10, 0.45], [11.8, 0.45], [12.8, 0.16], [14, 0.06]]),
    },
  });
  map.addLayer({
    id: AREA_FILL.cru,
    type: "fill",
    source: "wine",
    "source-layer": AREA_SRC.cru,
    minzoom: 10.4,
    paint: {
      "fill-color": cruColor,
      // Under the vines (z13) a cru wash would tint every plot: fade it and
      // let the cru outline above the vines carry the boundary.
      "fill-opacity": fade([[10.4, 0], [11.2, 0.5], [12.6, 0.5], [13.4, 0.1]]),
    },
  });

  return [
    { layerId: AREA_FILL.region, sourceLayer: AREA_SRC.region },
    { layerId: AREA_FILL.secteur, sourceLayer: AREA_SRC.appellation },
    { layerId: AREA_FILL.village, sourceLayer: AREA_SRC.appellation },
    { layerId: AREA_FILL.cru, sourceLayer: AREA_SRC.cru },
  ];
}

/**
 * Outlines and names of the four levels, added ABOVE the vines so a parent
 * boundary is never buried under the parcellaire.
 */
export function addAreaOutlinesAndLabels(map: MlMap, regionColor: Expr) {
  const ink = slot(AREA_INK, regionColor);
  const cruInk = tier(GRAND_CRU_DARK, PREMIER_CRU_DARK, ink);
  const zoomWidth = (...stops: number[]) => e(["interpolate", ["linear"], ["zoom"], ...stops]);
  /**
   * Line width by zoom; `["zoom"]` must stay the top-level input, so the
   * per-feature part (tier factor, selection) goes into every stop output.
   */
  const width = (stops: [number, number][], factor: (w: number) => unknown = (w) => w) =>
    e([
      "interpolate", ["linear"], ["zoom"],
      ...stops.flatMap(([z, w]) => [
        z,
        ["case", ["boolean", ["feature-state", "selected"], false], ["+", factor(w), 1.6], factor(w)],
      ]),
    ]);

  /** Own colour while the level is read, neutral once its children are. */
  const handOver = (own: Expr | string, readUntil: number) =>
    e(["interpolate", ["linear"], ["zoom"], readUntil - 0.3, own, readUntil + 0.5, PARENT_EDGE_COLOR]);

  // --- outlines (bottom → top: finest first, so parents stay on top) -----
  addLine(map, {
    id: "real-line-cru",
    sourceLayer: AREA_SRC.cru,
    minzoom: 10.4,
    color: tier(GRAND_CRU_COLOR, PREMIER_CRU_COLOR, ink),
    width: width([[10.4, 0.6], [13, 1.4], [16, 2.6]], (w) => tier(w * 1.5, w, w * 0.8)),
    casing: zoomWidth(12.5, 0, 13.2, 3.2, 16, 5.5),
  });
  addLine(map, {
    id: "real-line-village",
    sourceLayer: AREA_SRC.appellation,
    filter: isLevel(3),
    minzoom: 9.4,
    color: handOver(ink, AREA_BANDS.village.to),
    width: width([[9.4, 0.5], [11, 1], [14, 1.6]]),
  });
  addLine(map, {
    id: "real-line-secteur",
    sourceLayer: AREA_SRC.appellation,
    filter: isLevel(2),
    minzoom: 6.5,
    color: handOver(tier(GRAND_CRU_COLOR, PREMIER_CRU_COLOR, ink), AREA_BANDS.secteur.to),
    // Parent of the villages only: gone once the crus are read.
    visibleUntil: AREA_BANDS.village.to,
    width: width([[6.5, 0.8], [10, 1.5], [13, 1.8]]),
    casing: zoomWidth(6.5, 1.6, 10, 2.8, 13, 3.2),
  });
  addLine(map, {
    id: "real-line-region",
    sourceLayer: AREA_SRC.region,
    minzoom: 0,
    color: handOver(regionColor, AREA_BANDS.region.to),
    // Parent of the secteurs only: gone once the villages are read.
    visibleUntil: AREA_BANDS.secteur.to,
    width: width([[4, 1.2], [9, 2], [11, 2.2]]),
    casing: zoomWidth(4, 2.4, 9, 3.4, 11, 3.6),
  });

  // --- names at the centre while the level is the one being read ----------
  const name = e(["get", "name"]);
  addLabel(map, {
    id: "real-label-region",
    sourceLayer: AREA_SRC.labels,
    filter: isLevel(1),
    minzoom: 0,
    maxzoom: AREA_BANDS.region.to,
    text: name,
    size: 15,
    ink: regionColor,
    upper: true,
  });
  addLabel(map, {
    id: "real-label-secteur",
    sourceLayer: AREA_SRC.labels,
    filter: isLevel(2),
    minzoom: AREA_BANDS.secteur.from,
    maxzoom: AREA_BANDS.secteur.to,
    text: name,
    size: zoomWidth(7, 12, 10, 15),
    ink: tier(GRAND_CRU_DARK, PREMIER_CRU_DARK, ink),
    upper: true,
  });
  addLabel(map, {
    id: "real-label-village",
    sourceLayer: AREA_SRC.labels,
    filter: isLevel(3),
    minzoom: AREA_BANDS.village.from,
    maxzoom: AREA_BANDS.village.to,
    text: name,
    size: zoomWidth(9.6, 11, 12.5, 13),
    ink,
  });
  // Crus: short name + a small tier line, so "Les Caillerets" the premier cru
  // never reads like "LES CAILLERETS" the cadastral lieu-dit.
  addLabel(map, {
    id: "real-label-cru",
    sourceLayer: AREA_SRC.labels,
    filter: isLevel(4, 5),
    minzoom: AREA_BANDS.cru.from,
    text: e([
      "format",
      ["coalesce", ["get", "short_name"], ["get", "name"]], {},
      "\n", {},
      tier("GRAND CRU", "1ER CRU", ""), { "font-scale": 0.72 },
    ]),
    size: zoomWidth(11, 10.5, 15, 13),
    ink: cruInk,
    // Grands crus win the collisions, then premiers crus.
    sortKey: tier(0, 1, 2),
  });

  // --- the level above, named along its own outline ------------------------
  addLabel(map, {
    id: "real-label-region-edge",
    sourceLayer: AREA_SRC.region,
    minzoom: AREA_BANDS.region.to,
    maxzoom: AREA_BANDS.secteur.to + 0.3,
    text: name,
    size: 12,
    ink: PARENT_EDGE_COLOR,
    upper: true,
    alongLine: true,
    spacing: 700,
  });
  addLabel(map, {
    id: "real-label-secteur-edge",
    sourceLayer: AREA_SRC.appellation,
    filter: isLevel(2),
    minzoom: AREA_BANDS.secteur.to,
    maxzoom: AREA_BANDS.village.to + 0.3,
    text: name,
    size: 12,
    ink: PARENT_EDGE_COLOR,
    upper: true,
    alongLine: true,
    spacing: 600,
  });
  addLabel(map, {
    id: "real-label-village-edge",
    sourceLayer: AREA_SRC.appellation,
    filter: isLevel(3),
    minzoom: AREA_BANDS.village.to,
    text: name,
    size: 11.5,
    ink: PARENT_EDGE_COLOR,
    alongLine: true,
    spacing: 500,
  });
}

/**
 * Repaint hierarchy inks for a basemap. On a light basemap the ink is the
 * text colour; over imagery / geology the text turns white and the ink becomes
 * the halo, outlines keep their colour (wider), casings darken.
 */
export function applyHierarchyTheme(map: MlMap, theme: WineLayerTheme) {
  const dark = theme.lineColor !== null;
  for (const l of INK_LAYERS) {
    if (!map.getLayer(l.id)) continue;
    if (l.kind === "label") {
      map.setPaintProperty(l.id, "text-color", (dark ? "#ffffff" : l.ink) as never);
      map.setPaintProperty(l.id, "text-halo-color", (dark ? l.ink : "#fbf7ef") as never);
      map.setPaintProperty(l.id, "text-halo-width", dark ? 2 : 1.6);
    } else if (l.kind === "casing") {
      map.setPaintProperty(l.id, "line-color", dark ? "#ffffff" : "#fbf7ef");
    }
  }
}
