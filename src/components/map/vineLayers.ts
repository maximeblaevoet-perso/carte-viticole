/**
 * Planted vines (MVT `wine-vine-plots`) and reference domains on the map
 * (ADR 0016). Kept out of WineMap.tsx so the colouring rules stay in one place.
 */
import type { ExpressionSpecification, Map as MlMap } from "maplibre-gl";
import type { FeatureCollection, Point } from "geojson";
import { SCORE_RAMP } from "@/lib/terroir-score";
import type { WineDomain } from "@/lib/types";

export const VINE_SOURCE_LAYER = "wine-vine-plots";
export const VINE_FILL = "real-fill-vine-plots";
export const VINE_LINE = "real-line-vine-plots";
export const VINE_DOMAIN_LINE = "real-line-vine-domain";
export const DOMAIN_SOURCE = "domains";
export const DOMAIN_CIRCLE = "domains-circle";
export const DOMAIN_LABEL = "domains-label";
/** Same zoom as the INAO parcels / lieux-dits (migration 0013). */
export const VINE_MIN_ZOOM = 13;
const DOMAIN_HIGHLIGHT = "#ff2d87";
const NO_DOMAIN = "__none__";

/** Layers whose colours carry data: the basemap theme must not repaint them. */
export const THEME_EXEMPT_LAYERS = new Set([VINE_LINE, VINE_DOMAIN_LINE, DOMAIN_CIRCLE]);

export type VineColorBy =
  | "score_sun"
  | "score_cool"
  | "geologie"
  | "pente"
  | "exposition"
  | "altitude"
  | "domaine";

export const VINE_COLOR_OPTIONS: { id: VineColorBy; label: string }[] = [
  { id: "score_sun", label: "Score (soleil)" },
  { id: "score_cool", label: "Score (fraîcheur)" },
  { id: "geologie", label: "Géologie" },
  { id: "pente", label: "Pente" },
  { id: "exposition", label: "Exposition" },
  { id: "altitude", label: "Altitude" },
  { id: "domaine", label: "Domaine estimé" },
];

/** Rock family colours (keys of the score grid). */
export const FAMILY_COLORS: Record<string, string> = {
  alluvions: "#cfc9a6",
  cailloutis: "#d99a2b",
  colluvions: "#a85d22",
  eboulis: "#8c4a1c",
  solifluxion: "#b8743a",
  loess: "#e9dcae",
  limons: "#efe6c4",
  calcaire: "#4f78ad",
  marne: "#8fa7b8",
  marnes_gypse: "#b3c4d1",
  conglomerat: "#8e6249",
  gres: "#c98b5a",
  sable: "#f7e9a6",
  argile: "#9d8f7a",
  granite: "#e07b91",
  gneiss: "#c76b9a",
  micaschiste: "#a56cc1",
  schiste: "#6d5a8a",
  grauwacke: "#5b6b73",
  volcanique: "#6b4e8f",
  autre: "#a8a8a8",
};

export const ASPECT_COLORS: Record<string, string> = {
  N: "#2b6cb0", NE: "#2c9fb9", E: "#38a169", SE: "#a3b52f",
  S: "#e5a823", SO: "#dd6b20", O: "#c53030", NO: "#7e57c2", plat: "#bdbdbd",
};

export const SLOPE_RAMP: [number, string][] = [[0, "#ffffcc"], [5, "#fed976"], [12, "#fd8d3c"], [25, "#e31a1c"], [45, "#800026"]];
export const ALTITUDE_RAMP: [number, string][] = [[170, "#e5f5e0"], [220, "#a1d99b"], [280, "#41ab5d"], [350, "#8c6d31"], [450, "#5c3d1e"]];

/**
 * Numeric MVT property. ST_AsMVT writes Postgres `numeric` columns as strings,
 * and a colour expression fed a string fails — MapLibre then paints black.
 */
const numProp = (prop: string, fallback: number) =>
  ["to-number", ["coalesce", ["get", prop], fallback], fallback];

const ramp = (prop: string, stops: [number, string][], fallback: number): ExpressionSpecification =>
  ["interpolate", ["linear"], numProp(prop, fallback), ...stops.flat()] as unknown as ExpressionSpecification;

/** Fill colour of a vine plot for the chosen reading. */
export function vineColorExpression(by: VineColorBy): ExpressionSpecification {
  switch (by) {
    case "score_sun":
      return ramp("score_sun", SCORE_RAMP, 0);
    case "score_cool":
      return ramp("score_cool", SCORE_RAMP, 0);
    case "pente":
      return ramp("slope_pct", SLOPE_RAMP, 0);
    case "altitude":
      return ramp("altitude_m", ALTITUDE_RAMP, 0);
    case "geologie":
      return [
        "match", ["coalesce", ["get", "geol_family"], "autre"],
        ...Object.entries(FAMILY_COLORS).flat(),
        FAMILY_COLORS.autre,
      ] as unknown as ExpressionSpecification;
    case "exposition":
      return [
        "case",
        ["<", numProp("slope_pct", 0), 2], ASPECT_COLORS.plat,
        [
          "step", numProp("aspect_deg", 0),
          ASPECT_COLORS.N, 22.5, ASPECT_COLORS.NE, 67.5, ASPECT_COLORS.E, 112.5, ASPECT_COLORS.SE,
          157.5, ASPECT_COLORS.S, 202.5, ASPECT_COLORS.SO, 247.5, ASPECT_COLORS.O,
          292.5, ASPECT_COLORS.NO, 337.5, ASPECT_COLORS.N,
        ],
      ] as unknown as ExpressionSpecification;
    case "domaine":
      return [
        "case", ["to-boolean", ["get", "domain_id"]],
        ["case", ["==", ["get", "domain_via_cru"], true], "#7b1fa2", "#d81b60"],
        "#cfcfcf",
      ] as unknown as ExpressionSpecification;
  }
}

/** Planted vines: fill by the chosen reading, thin outline, domain highlight. */
export function addVineLayers(map: MlMap, by: VineColorBy, beforeId?: string) {
  map.addLayer(
    {
      id: VINE_FILL,
      type: "fill",
      source: "wine",
      "source-layer": VINE_SOURCE_LAYER,
      minzoom: VINE_MIN_ZOOM,
      paint: {
        "fill-color": vineColorExpression(by),
        "fill-opacity": [
          "case",
          ["boolean", ["feature-state", "selected"], false], 0.95,
          ["boolean", ["feature-state", "hover"], false], 0.9,
          0.72,
        ],
      },
    },
    beforeId
  );
  map.addLayer(
    {
      id: VINE_LINE,
      type: "line",
      source: "wine",
      "source-layer": VINE_SOURCE_LAYER,
      minzoom: VINE_MIN_ZOOM,
      paint: {
        "line-color": [
          "case", ["boolean", ["feature-state", "selected"], false], "#111111", "#3b2a1a",
        ],
        "line-width": ["case", ["boolean", ["feature-state", "selected"], false], 2.2, 0.4],
        "line-opacity": 0.8,
      },
    },
    beforeId
  );
  map.addLayer(
    {
      id: VINE_DOMAIN_LINE,
      type: "line",
      source: "wine",
      "source-layer": VINE_SOURCE_LAYER,
      minzoom: VINE_MIN_ZOOM,
      filter: ["==", ["get", "domain_id"], NO_DOMAIN],
      paint: { "line-color": DOMAIN_HIGHLIGHT, "line-width": 2.4, "line-opacity": 0.95 },
    },
    beforeId
  );
}

export function setVineColor(map: MlMap, by: VineColorBy) {
  if (map.getLayer(VINE_FILL)) map.setPaintProperty(VINE_FILL, "fill-color", vineColorExpression(by));
}

/** Outline every plot attributed to one domain (or none). */
export function highlightDomainPlots(map: MlMap, domainId: string | null) {
  if (!map.getLayer(VINE_DOMAIN_LINE)) return;
  map.setFilter(VINE_DOMAIN_LINE, ["==", ["get", "domain_id"], domainId ?? NO_DOMAIN]);
  if (map.getLayer(DOMAIN_CIRCLE)) {
    map.setPaintProperty(DOMAIN_CIRCLE, "circle-radius", [
      "case", ["==", ["get", "id"], domainId ?? NO_DOMAIN], 8, 5,
    ]);
  }
}

export function domainCollection(domains: WineDomain[]): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: domains.map((d) => ({
      type: "Feature",
      id: d.id,
      geometry: { type: "Point", coordinates: [d.lon, d.lat] },
      properties: { id: d.id, name: d.name, score: d.scoreSun ?? -1 },
    })),
  };
}

/** Cellar markers, coloured by the domain's estimated score. */
export function addDomainLayers(map: MlMap, domains: WineDomain[]) {
  if (map.getSource(DOMAIN_SOURCE)) return;
  map.addSource(DOMAIN_SOURCE, { type: "geojson", data: domainCollection(domains), promoteId: "id" });
  map.addLayer({
    id: DOMAIN_CIRCLE,
    type: "circle",
    source: DOMAIN_SOURCE,
    minzoom: 9,
    paint: {
      "circle-radius": 5,
      "circle-color": [
        "case", ["<", ["get", "score"], 0], "#9ca3af", ramp("score", SCORE_RAMP, 0),
      ] as unknown as ExpressionSpecification,
      "circle-stroke-color": "#1f1f1f",
      "circle-stroke-width": 1.5,
    },
  });
  map.addLayer({
    id: DOMAIN_LABEL,
    type: "symbol",
    source: DOMAIN_SOURCE,
    minzoom: 11,
    layout: {
      "text-field": ["get", "name"],
      "text-size": 11,
      "text-font": ["Open Sans Semibold"],
      "text-offset": [0.8, 0],
      "text-anchor": "left",
      "text-optional": true,
    },
    paint: { "text-color": "#1f2937", "text-halo-color": "#ffffff", "text-halo-width": 1.4 },
  });
}
