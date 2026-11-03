/**
 * Planted vines (MVT `wine-vine-plots`) and reference domains on the map
 * (ADR 0016). Kept out of WineMap.tsx so the colouring rules stay in one place.
 */
import type { ExpressionSpecification, GeoJSONSource, Map as MlMap } from "maplibre-gl";
import type { Feature, FeatureCollection, Point } from "geojson";
import { SCORE_RAMP } from "@/lib/terroir-score";
import type { WineDomain } from "@/lib/types";

export const VINE_SOURCE_LAYER = "wine-vine-plots";
export const VINE_FILL = "real-fill-vine-plots";
export const VINE_LINE = "real-line-vine-plots";
export const DOMAIN_SOURCE = "domains";
export const DOMAIN_CIRCLE = "domains-circle";
export const DOMAIN_LABEL = "domains-label";
/** Declared grands crus / lieux-dits of the selected domain (ADR 0019). */
export const DOMAIN_PLACES_SOURCE = "domain-places";
export const DOMAIN_PLACES_LINE = "domain-places-line";
export const DOMAIN_PLACES_LABEL = "domain-places-label";
/** Same zoom as the INAO parcels / lieux-dits (migration 0013). */
export const VINE_MIN_ZOOM = 13;
const DOMAIN_HIGHLIGHT = "#ff2d87";
const NO_DOMAIN = "__none__";

/** Layers whose colours carry data: the basemap theme must not repaint them. */
export const THEME_EXEMPT_LAYERS = new Set([VINE_LINE, DOMAIN_CIRCLE, DOMAIN_PLACES_LINE]);

export type VineColorBy =
  | "score_sun"
  | "score_cool"
  | "geologie"
  | "pente"
  | "exposition"
  | "altitude";

export const VINE_COLOR_OPTIONS: { id: VineColorBy; label: string }[] = [
  { id: "score_sun", label: "Score (soleil)" },
  { id: "score_cool", label: "Score (fraîcheur)" },
  { id: "geologie", label: "Géologie" },
  { id: "pente", label: "Pente" },
  { id: "exposition", label: "Exposition" },
  { id: "altitude", label: "Altitude" },
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

/**
 * Cyclic wheel following the sun reading of the score grid: warmest at S/SE,
 * coldest at N; the morning side (E) runs through gold, the afternoon side (O)
 * through mauve, so E and O stay distinct at similar warmth.
 */
export const ASPECT_COLORS: Record<string, string> = {
  N: "#2c5aa0", NE: "#3aa0b8", E: "#e8c547", SE: "#f08c2e",
  S: "#d9412b", SO: "#b02a4a", O: "#9c5bb5", NO: "#5b6fc4", plat: "#bdbdbd",
};

/** Compass order, clockwise from north (sector centres every 45°). */
export const ASPECT_SECTORS = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"] as const;

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
  }
}

/** Planted vines: fill by the chosen reading, thin outline. */
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
}

export function setVineColor(map: MlMap, by: VineColorBy) {
  if (map.getLayer(VINE_FILL)) map.setPaintProperty(VINE_FILL, "fill-color", vineColorExpression(by));
}

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

/**
 * Outlines (dashed) and names of the places a domain declares — never plots:
 * which vines a domain farms is not public (ADR 0019). `null` clears them.
 */
export function placesCollection(domain: WineDomain | null): FeatureCollection {
  if (!domain) return EMPTY;
  const features: Feature[] = [];
  for (const p of domain.composition) {
    if (!p.geometry) continue;
    features.push({ type: "Feature", geometry: p.geometry, properties: {} });
    if (p.lon != null && p.lat != null) {
      const ha = p.areaHa != null ? ` · ≈ ${p.areaHa.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} ha` : "";
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.lon, p.lat] },
        properties: { label: `${p.name}${ha}` },
      });
    }
  }
  return { type: "FeatureCollection", features };
}

/** Selected domain: enlarge its cellar marker and outline its declared places. */
export function highlightDomain(map: MlMap, domain: WineDomain | null) {
  const data = placesCollection(domain);
  const src = map.getSource(DOMAIN_PLACES_SOURCE) as GeoJSONSource | undefined;
  if (src) src.setData(data);
  else if (domain) addDomainPlaceLayers(map, data);
  const domainId = domain?.id ?? null;
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

function addDomainPlaceLayers(map: MlMap, data: FeatureCollection) {
  map.addSource(DOMAIN_PLACES_SOURCE, { type: "geojson", data });
  // Below the cellar markers, above everything else.
  const before = map.getLayer(DOMAIN_CIRCLE) ? DOMAIN_CIRCLE : undefined;
  map.addLayer(
    {
      id: DOMAIN_PLACES_LINE,
      type: "line",
      source: DOMAIN_PLACES_SOURCE,
      filter: ["!=", ["geometry-type"], "Point"],
      paint: {
        "line-color": DOMAIN_HIGHLIGHT,
        "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1.4, 14, 2.4],
        "line-dasharray": [2, 1.2],
        "line-opacity": 0.95,
      },
    },
    before
  );
  map.addLayer(
    {
      id: DOMAIN_PLACES_LABEL,
      type: "symbol",
      source: DOMAIN_PLACES_SOURCE,
      filter: ["==", ["geometry-type"], "Point"],
      minzoom: 10,
      layout: {
        "text-field": ["get", "label"],
        "text-size": 11,
        "text-font": ["Open Sans Semibold"],
        "text-optional": true,
      },
      paint: { "text-color": "#9d174d", "text-halo-color": "#ffffff", "text-halo-width": 1.6 },
    },
    before
  );
}
