/**
 * Basemap registry (ADR 0011).
 *
 * The map used to hardcode a single CARTO raster basemap. CARTO closed
 * anonymous access (tiles still return 200 but carry an "API KEY REQUIRED"
 * watermark), so the basemap is now a small registry of key-free public
 * services, switchable at runtime:
 *
 * - `plan`    — IGN Plan v2 (sober vector-rendered raster), the default.
 * - `aerial`  — IGN Orthophotos (20 cm/px, France métropolitaine, up to z19).
 * - `geology` — BRGM geological map. WMS only: the BRGM WMTS endpoint returns a
 *               MapServer error, so this one is a raster source built with the
 *               MapLibre `{bbox-epsg-3857}` placeholder.
 *
 * There is no separate relief overlay: IGN Plan v2 already ships its own
 * shading, and a second estompage layer only muddied the other two.
 *
 * Every entry also carries a `theme`: the wine layers (synthetic GeoJSON + real
 * MVT) keep their geometry and sources across a basemap switch, but their
 * outline / label colours are re-painted so they stay legible on dark imagery
 * or on the saturated geological map.
 */

/** Géoplateforme (IGN) WMTS endpoint — key-free, `PM` (EPSG:3857) matrix set. */
const GEOPF_WMTS =
  "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0" +
  "&LAYER=$LAYER&STYLE=$STYLE&TILEMATRIXSET=PM" +
  "&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=$FORMAT";

/** Build a Géoplateforme tile template. `{z}/{x}/{y}` stay literal for MapLibre. */
function geopf(layer: string, style: string, format: string): string {
  return GEOPF_WMTS.replace("$LAYER", layer)
    .replace("$STYLE", style)
    .replace("$FORMAT", encodeURIComponent(format));
}

/** BRGM geology is WMS-only; MapLibre fills `{bbox-epsg-3857}` per tile. */
function brgmWms(layers: string): string {
  return (
    "https://geoservices.brgm.fr/geologie?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap" +
    `&LAYERS=${layers}&CRS=EPSG:3857&BBOX={bbox-epsg-3857}` +
    "&WIDTH=256&HEIGHT=256&FORMAT=image%2Fpng&TRANSPARENT=true&STYLES="
  );
}

export const IGN_ATTRIBUTION = "© IGN / Géoplateforme";
export const BRGM_ATTRIBUTION = "© BRGM";

export type BasemapId = "plan" | "aerial" | "geology";

/**
 * How the wine layers repaint over a given basemap. `lineColor: null` keeps the
 * per-region palette (readable on the light Plan); imagery and geology override
 * it with a single high-contrast colour instead.
 */
export interface WineLayerTheme {
  /** Outline colour override, or `null` to keep the per-region colour. */
  lineColor: string | null;
  lineOpacity: number;
  /** Extra px added to the existing (state-driven) line widths. */
  lineWidthBoost: number;
  labelColor: string;
  labelHaloColor: string;
  labelHaloWidth: number;
  /** Halo around the point markers used for areas with no contour. */
  circleStrokeColor: string;
}

export interface BasemapDefinition {
  id: BasemapId;
  label: string;
  /** Short hint shown as the control's tooltip. */
  hint: string;
  attribution: string;
  /** `true` for the BRGM WMS: no CDN, slow — only load it once selected. */
  lazy: boolean;
  /** Base raster opacity of the basemap layer itself. */
  opacity: number;
  theme: WineLayerTheme;
  /** Raster tile templates for MapLibre. */
  tiles: string[];
}

/** Light basemap: keep the existing editorial palette untouched. */
const LIGHT_THEME: WineLayerTheme = {
  lineColor: null,
  lineOpacity: 0.85,
  lineWidthBoost: 0,
  labelColor: "#4a1b26",
  labelHaloColor: "#fbf7ef",
  labelHaloWidth: 1.6,
  circleStrokeColor: "#fbf7ef",
};

/** Aerial imagery: white outlines + dark halo, the only combination that reads. */
const IMAGERY_THEME: WineLayerTheme = {
  lineColor: "#ffffff",
  lineOpacity: 1,
  lineWidthBoost: 0.8,
  labelColor: "#ffffff",
  labelHaloColor: "#20160f",
  labelHaloWidth: 2,
  circleStrokeColor: "#20160f",
};

/** Geology: saturated, busy background → near-black outlines, white halo labels. */
const GEOLOGY_THEME: WineLayerTheme = {
  lineColor: "#1c1116",
  lineOpacity: 0.95,
  lineWidthBoost: 0.6,
  labelColor: "#1c1116",
  labelHaloColor: "#ffffff",
  labelHaloWidth: 2,
  circleStrokeColor: "#ffffff",
};

export const BASEMAPS: Record<BasemapId, BasemapDefinition> = {
  plan: {
    id: "plan",
    label: "Plan",
    hint: "Plan IGN v2 — fond sobre",
    attribution: IGN_ATTRIBUTION,
    lazy: false,
    opacity: 0.9,
    theme: LIGHT_THEME,
    tiles: [geopf("GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", "normal", "image/png")],
  },
  aerial: {
    id: "aerial",
    label: "Aérien",
    hint: "Orthophotos IGN — 20 cm/px, France métropolitaine",
    attribution: IGN_ATTRIBUTION,
    lazy: false,
    opacity: 1,
    theme: IMAGERY_THEME,
    tiles: [geopf("ORTHOIMAGERY.ORTHOPHOTOS", "normal", "image/jpeg")],
  },
  geology: {
    id: "geology",
    label: "Géologie",
    hint: "Carte géologique BRGM — échelle adaptée au zoom",
    attribution: BRGM_ATTRIBUTION,
    lazy: true,
    opacity: 0.95,
    theme: GEOLOGY_THEME,
    // `GEOLOGIE` is BRGM's scale-adaptive composite: it serves 1/1 000 000,
    // 1/250 000 or 1/50 000 depending on the request scale. The named layers
    // (`SCAN_D_GEOL50`, `SCAN_F_GEOL250`) each have a hard scale window and
    // return a blank tile outside it — verified: nothing paints below z11.
    tiles: [brgmWms("GEOLOGIE")],
  },
};

export const BASEMAP_ORDER: BasemapId[] = ["plan", "aerial", "geology"];

export const DEFAULT_BASEMAP: BasemapId = "aerial";
