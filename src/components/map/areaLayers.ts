/**
 * Real (MVT) wine-area hierarchy on the map, read progressively.
 *
 * Since ADR 0025 a level is no longer tied to one zoom band for all of France:
 * each place is revealed by the share of the screen it fills (`reveal.ts`).
 * A small Alsace appellation hands over to its grands crus later than the
 * Côte de Nuits, and Châteauneuf-du-Pape shows its vines as soon as it fills
 * the screen, not at a fixed z13.
 *
 *   région      ─ read until it fills the screen, outline kept 2 zooms more
 *   secteur     ─ drawn from S, read until R, faint wash, outline gone at R+2
 *   village     ─ same rule, one level down
 *   cru         ─ drawn from S (premier = doré, grand = orange brique)
 *   vines       ─ from their commune / appellation's reveal (vineLayers.ts)
 *
 * Each level fades in as the previous one fades to a faint wash, so the user
 * never zooms through a blank band. Only the level right above the one being
 * read keeps its outline, in a neutral brown, with its name along it.
 *
 * Colours: `map_color_idx` (migration 0017) picks a pastel so two touching
 * siblings never share one. Crus are a quality tier, not a place: one colour
 * per tier in every region (ADR 0022).
 */
import type maplibregl from "maplibre-gl";
import type { Map as MlMap } from "maplibre-gl";
import type { WineLayerTheme } from "@/lib/basemaps";
import { REVEAL, perZoom, ramp, revealZ, revealed, since, startZ, withState } from "./reveal";

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

/** Regions whose grand / premier cru outlines are drawn heavier. */
const MARKED_CRU_REGION = e(["in", ["coalesce", ["get", "root_region_id"], ""], ["literal", ["alsace", "bourgogne"]]]);
const MARKED_CRU = e([
  "all",
  MARKED_CRU_REGION,
  ["in", ["coalesce", ["get", "region_type"], ""], ["literal", ["grand-cru", "premier-cru"]]],
]);

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

/* --- per-feature reading windows (ADR 0025), as functions of a grid zoom -- */

type AtZoom = (z: number, off: number) => Expr;

/** Fades in at S. */
const appear = (to: number): AtZoom => (z, off) =>
  ramp(since(z, startZ(off)), [[-0.5, 0], [0, to]]);

/** Secteur / village fill: read from S to R, faint wash, gone at R + 1.5. */
const areaFill: AtZoom = (z, off) =>
  e(["min", appear(0.45)(z, off), ramp(since(z, revealZ(off)), [[-0.3, 0.45], [0.5, 0.12], [1.5, 0]])]);

/** Cru fill: in at S, a wash one zoom later — the vines carry the colour. */
const cruFill: AtZoom = (z, off) =>
  e(["min", appear(0.5)(z, off), ramp(since(z, startZ(off)), [[1, 0.5], [2, 0.1]])]);

/** Outline kept until the place is 4× the screen (R + 2). */
const outlineUntil = (base: number): AtZoom => (z, off) =>
  ramp(since(z, revealZ(off)), [[REVEAL.edgeKept - 0.5, base], [REVEAL.edgeKept, 0]]);

const minOf = (...fs: AtZoom[]): AtZoom => (z, off) => e(["min", ...fs.map((f) => f(z, off))]);

/** Name at the centre: from S + 0.5 to R + 0.3 (hand-over). */
const nameAtCentre: AtZoom = (z, off) =>
  e([
    "min",
    ramp(since(z, startZ(off)), [[0, 0], [0.5, 1]]),
    ramp(since(z, revealZ(off)), [[0, 1], [0.5, 0]]),
  ]);
/** Region name: until it fills the screen. */
const regionName: AtZoom = (z, off) => ramp(since(z, revealZ(off)), [[0, 1], [0.5, 0]]);
/** Leaf (cru) name: from S + 0.5 on. */
const leafName: AtZoom = (z, off) => ramp(since(z, startZ(off)), [[0, 0], [0.5, 1]]);
/** Name along the outline: from R to R + 2. */
const nameAlongEdge: AtZoom = (z, off) =>
  e([
    "min",
    ramp(since(z, revealZ(off)), [[0, 0], [0.4, 1]]),
    ramp(since(z, revealZ(off)), [[REVEAL.edgeKept - 0.4, 1], [REVEAL.edgeKept, 0]]),
  ]);

/** Own colour while the place is read, neutral once its children are. */
const handOver = (own: Expr | string) => (z: number, off: number) =>
  e(["interpolate", ["linear"], since(z, revealZ(off)), -0.3, own, 0.5, PARENT_EDGE_COLOR]);

/** Linear interpolation of `[zoom, value]` stops, in JS (for text sizes). */
function lerp(stops: [number, number][], z: number): number {
  if (z <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [z1, v1] = stops[i];
    const [z0, v0] = stops[i - 1];
    if (z <= z1) return v0 + ((v1 - v0) * (z - z0)) / (z1 - z0);
  }
  return stops[stops.length - 1][1];
}

/** Layer ids drawn by this module that handle their own theme. */
export const HIERARCHY_LAYERS = new Set<string>();

interface LineSpec {
  id: string;
  sourceLayer: string;
  filter?: maplibregl.FilterSpecification;
  minzoom: number;
  /** Colour: constant / data expression, or per-feature by zoom. */
  color: Expr | string | ((z: number, off: number) => Expr);
  width: Expr;
  casing?: Expr;
  /** Casing opacity (default 0.45). */
  casingOpacity?: Expr | number;
  dash?: number[];
  /** Visibility 0–1, per feature and zoom (ADR 0025). */
  visible: AtZoom;
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
  const opacity = (base: Expr | number) => (off: number) =>
    perZoom((z) => e(["*", base, spec.visible(z, off)]));
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
      paint: {
        "line-color": "#fbf7ef",
        "line-width": spec.casing,
        "line-opacity": revealed(casingId, "line-opacity", opacity(spec.casingOpacity ?? 0.45)),
      },
    });
    HIERARCHY_LAYERS.add(casingId);
    INK_LAYERS.push({ id: casingId, ink: "#fbf7ef", kind: "casing" });
  }
  const color = spec.color;
  map.addLayer({
    id: spec.id,
    type: "line",
    source: "wine",
    "source-layer": spec.sourceLayer,
    minzoom: spec.minzoom,
    ...(spec.filter ? { filter: spec.filter } : {}),
    layout: { "line-join": "round" },
    paint: {
      "line-color":
        typeof color === "function"
          ? revealed(spec.id, "line-color", (off) => perZoom((z) => color(z, off)))
          : color,
      "line-width": spec.width,
      "line-opacity": revealed(spec.id, "line-opacity", opacity(0.95)),
      ...(spec.dash ? { "line-dasharray": spec.dash } : {}),
    },
  });
  HIERARCHY_LAYERS.add(spec.id);
  INK_LAYERS.push({ id: spec.id, ink: "#000", kind: "line" });
}

interface LabelSpec {
  id: string;
  sourceLayer: string;
  filter?: maplibregl.FilterSpecification;
  minzoom?: number;
  text: Expr;
  /** Text size by zoom (px), shrunk to 0 where the name is hidden. */
  size: [number, number][];
  ink: Expr | string;
  /** Visibility 0–1, per feature and zoom (ADR 0025). */
  visible: AtZoom;
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
    ...(spec.minzoom !== undefined ? { minzoom: spec.minzoom } : {}),
    ...(spec.filter ? { filter: spec.filter } : {}),
    layout: {
      "text-field": spec.text,
      // A transparent label would still win collisions against the names
      // being read: its size drops to 0 where it is hidden.
      "text-size": revealed(
        spec.id,
        "text-size",
        (off) =>
          perZoom((z) => e(["*", lerp(spec.size, z), ["step", spec.visible(z, off), 0, 0.05, 1]])),
        true
      ),
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
    paint: {
      "text-color": spec.ink,
      "text-halo-color": "#fbf7ef",
      "text-halo-width": 1.6,
      "text-opacity": revealed(spec.id, "text-opacity", (off) => perZoom((z) => spec.visible(z, off))),
    },
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
  // "you are in the Mâconnais" — gone once the secteur is 3× the screen.
  map.addLayer({
    id: AREA_FILL.secteur,
    type: "fill",
    source: "wine",
    "source-layer": AREA_SRC.appellation,
    filter: isLevel(2),
    paint: {
      "fill-color": tier(GRAND_CRU_COLOR, PREMIER_CRU_COLOR, pastel),
      "fill-opacity": revealed(AREA_FILL.secteur, "fill-opacity", (off) =>
        perZoom((z) => withState(areaFill(z, off), 0.14, 0.5))
      ),
    },
  });
  map.addLayer({
    id: AREA_FILL.village,
    type: "fill",
    source: "wine",
    "source-layer": AREA_SRC.appellation,
    filter: isLevel(3),
    paint: {
      "fill-color": pastel,
      "fill-opacity": revealed(AREA_FILL.village, "fill-opacity", (off) =>
        perZoom((z) => withState(areaFill(z, off), 0.14, 0.5))
      ),
    },
  });
  map.addLayer({
    id: AREA_FILL.cru,
    type: "fill",
    source: "wine",
    "source-layer": AREA_SRC.cru,
    paint: {
      "fill-color": cruColor,
      // Under the vines a cru wash would tint every plot: it fades and the
      // cru outline above the vines carries the boundary.
      "fill-opacity": revealed(AREA_FILL.cru, "fill-opacity", (off) =>
        perZoom((z) => withState(cruFill(z, off), 0.14, 0.5))
      ),
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

  // --- outlines (bottom → top: finest first, so parents stay on top) -----
  addLine(map, {
    id: "real-line-cru",
    sourceLayer: AREA_SRC.cru,
    minzoom: 9.5,
    color: tier(GRAND_CRU_COLOR, PREMIER_CRU_COLOR, ink),
    // Alsace / Bourgogne: the grand / premier cru boundary IS the reading of
    // the map, so it is drawn ~1.8× heavier there (user review 2026-11-23).
    // Champagne crus are vine footprints (ADR 0026) packed side by side: a
    // heavy line would cut the vineyard up, so they keep the light line.
    width: width([[10.4, 0.7], [13, 1.4], [16, 2.6]], (w) =>
      e(["case", MARKED_CRU_REGION, tier(w * 2.6, w * 1.9, w * 0.8), tier(w * 1.5, w, w * 0.8)])
    ),
    // Light casing so the line reads over vines, imagery and the geology map.
    casing: e([
      "interpolate", ["linear"], ["zoom"],
      10.5, 0,
      12, ["case", MARKED_CRU, 3.6, 1.6],
      16, ["case", MARKED_CRU, 7.5, 5.5],
    ]),
    // Near-opaque there: brick / gold must not melt into red-orange vines.
    casingOpacity: e(["case", MARKED_CRU, 0.9, 0.45]),
    visible: appear(1),
  });
  addLine(map, {
    id: "real-line-village",
    sourceLayer: AREA_SRC.appellation,
    filter: isLevel(3),
    minzoom: 7,
    color: handOver(ink),
    width: width([[9.4, 0.5], [11, 1], [14, 1.6]]),
    visible: minOf(appear(1), outlineUntil(1)),
  });
  addLine(map, {
    id: "real-line-secteur",
    sourceLayer: AREA_SRC.appellation,
    filter: isLevel(2),
    minzoom: 6,
    color: handOver(tier(GRAND_CRU_COLOR, PREMIER_CRU_COLOR, ink)),
    width: width([[6.5, 0.8], [10, 1.5], [13, 1.8]]),
    casing: zoomWidth(6.5, 1.6, 10, 2.8, 13, 3.2),
    visible: minOf(appear(1), outlineUntil(1)),
  });
  addLine(map, {
    id: "real-line-region",
    sourceLayer: AREA_SRC.region,
    minzoom: 0,
    color: handOver(regionColor),
    width: width([[4, 1.2], [9, 2], [11, 2.2]]),
    casing: zoomWidth(4, 2.4, 9, 3.4, 11, 3.6),
    visible: outlineUntil(1),
  });

  // --- names at the centre while the place is the one being read ----------
  const name = e(["get", "name"]);
  addLabel(map, {
    id: "real-label-region",
    sourceLayer: AREA_SRC.labels,
    filter: isLevel(1),
    text: name,
    size: [[0, 15]],
    ink: regionColor,
    upper: true,
    visible: regionName,
  });
  addLabel(map, {
    id: "real-label-secteur",
    sourceLayer: AREA_SRC.labels,
    filter: isLevel(2),
    text: name,
    size: [[7, 12], [10, 15]],
    ink: tier(GRAND_CRU_DARK, PREMIER_CRU_DARK, ink),
    upper: true,
    visible: nameAtCentre,
  });
  addLabel(map, {
    id: "real-label-village",
    sourceLayer: AREA_SRC.labels,
    filter: isLevel(3),
    text: name,
    size: [[9.6, 11], [12.5, 13]],
    ink,
    visible: nameAtCentre,
  });
  // Crus: short name + a small tier line, so "Les Caillerets" the premier cru
  // never reads like "LES CAILLERETS" the cadastral lieu-dit.
  addLabel(map, {
    id: "real-label-cru",
    sourceLayer: AREA_SRC.labels,
    filter: isLevel(4, 5),
    text: e([
      "format",
      ["coalesce", ["get", "short_name"], ["get", "name"]], {},
      "\n", {},
      tier("GRAND CRU", "1ER CRU", ""), { "font-scale": 0.72 },
    ]),
    size: [[11, 10.5], [15, 13]],
    ink: cruInk,
    // Grands crus win the collisions, then premiers crus.
    sortKey: tier(0, 1, 2),
    visible: leafName,
  });

  // --- the level above, named along its own outline ------------------------
  addLabel(map, {
    id: "real-label-region-edge",
    sourceLayer: AREA_SRC.region,
    minzoom: 6,
    text: name,
    size: [[0, 12]],
    ink: PARENT_EDGE_COLOR,
    upper: true,
    alongLine: true,
    spacing: 700,
    visible: nameAlongEdge,
  });
  addLabel(map, {
    id: "real-label-secteur-edge",
    sourceLayer: AREA_SRC.appellation,
    filter: isLevel(2),
    text: name,
    size: [[0, 12]],
    ink: PARENT_EDGE_COLOR,
    upper: true,
    alongLine: true,
    spacing: 600,
    visible: nameAlongEdge,
  });
  addLabel(map, {
    id: "real-label-village-edge",
    sourceLayer: AREA_SRC.appellation,
    filter: isLevel(3),
    text: name,
    size: [[0, 11.5]],
    ink: PARENT_EDGE_COLOR,
    alongLine: true,
    spacing: 500,
    visible: nameAlongEdge,
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
