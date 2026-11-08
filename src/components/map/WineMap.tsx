"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MlMap, MapGeoJSONFeature, Popup } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type {
  Feature,
  FeatureCollection,
  Point,
  MultiPolygon,
} from "geojson";
import { WINE_AREAS, LEVEL_ZOOM, REGION_TYPE_LABELS, getArea } from "@/data/areas";
import { AREA_GEOMETRIES, DEFAULT_AREA_COLOR, REGION_COLORS } from "@/data/geo";
import { shouldUseSupabase } from "@/lib/supabase";
import { WINE_TILES_VERSION } from "@/lib/wine-tiles";
import { BASEMAPS, DEFAULT_BASEMAP } from "@/lib/basemaps";
import type { BasemapId, WineLayerTheme } from "@/lib/basemaps";
import { parseSubsoilResponse } from "@/lib/subsoil";
import { BasemapSwitcher } from "@/components/map/BasemapSwitcher";
import { GeologyReadout } from "@/components/map/GeologyReadout";
import type { GeologyReadoutState } from "@/components/map/GeologyReadout";
import { VineColorSwitcher } from "@/components/map/VineColorSwitcher";
import {
  DOMAIN_CIRCLE,
  THEME_EXEMPT_LAYERS,
  VINE_FILL,
  VINE_SOURCE_LAYER,
  addDomainLayers,
  addVineLayers,
  highlightDomain,
  setVineColor,
} from "@/components/map/vineLayers";
import { OffscreenPlaces } from "@/components/map/OffscreenPlaces";
import {
  GRAND_CRU_COLOR,
  HIERARCHY_LAYERS,
  PREMIER_CRU_COLOR,
  addAreaFills,
  addAreaOutlinesAndLabels,
  applyHierarchyTheme,
} from "@/components/map/areaLayers";
import type { VineColorBy } from "@/components/map/vineLayers";
import { fetchDomains } from "@/hooks/useDomains";
import {
  aspectLabel,
  cruLabel,
  domainSelection as domainFeature,
  parseComponents,
  rockFamilyLabel,
} from "@/lib/terroir-score";
import type {
  AreaLevel,
  GeoDataProvenance,
  SelectedGeoFeature,
  VinePlot,
  WineArea,
  WineDomain,
} from "@/lib/types";

/** Regions that have a reference-domain list (ADR 0016). */
const DOMAIN_REGIONS = ["alsace", "bourgogne"];

/** Lieu-dit of a region with planted vines (Alsace 67/68, Bourgogne 21/71/89):
 * the vines carry the colour, the lieu-dit fill stays near-transparent. */
const VINE_REGION_COMMUNE = [
  "in",
  ["slice", ["coalesce", ["get", "commune_insee"], ""], 0, 2],
  ["literal", ["67", "68", "21", "71", "89"]],
] as unknown as maplibregl.ExpressionSpecification;

const FRANCE_CENTER: [number, number] = [2.6, 46.3];

/** Ids owned by the basemap machinery — everything else is a wine layer. */
const BG_LAYER = "bg";
const BASEMAP_LAYER = "basemap";
const BASEMAP_SOURCE = "basemap-src";
const BASE_LAYER_IDS = new Set([BG_LAYER, BASEMAP_LAYER]);

/** True when real PostGIS vector tiles should be layered on top (ADR 0007). */
const USE_REAL = shouldUseSupabase();

/** Properties carried by every synthetic map feature (geometry-agnostic). */
interface AreaFeatureProps {
  id: string;
  name: string;
  level: AreaLevel;
  parentName: string;
  regionType: string;
  /** Level-1 region this feature belongs to — drives synthetic suppression. */
  rootRegionId: string;
  color: string;
  dataNote: string;
  hasContour: boolean;
}

/**
 * Cru colours (doré / orange brique, ADR 0022) come from `areaLayers`: grands
 * and premiers crus are a quality tier, one colour across every region, for
 * synthetic and real features alike.
 */

function colorFor(area: WineArea): string {
  if (area.regionType === "grand-cru") return GRAND_CRU_COLOR;
  if (area.regionType === "premier-cru") return PREMIER_CRU_COLOR;
  return REGION_COLORS[area.rootRegionId] ?? DEFAULT_AREA_COLOR;
}

function dataNoteFor(area: WineArea): string {
  if (area.level === 1) return "Climat · sols · notes (niveau régional)";
  const fineSoils = area.availableDataScopes.includes("soils");
  return fineSoils
    ? "Sols fins (seed) · climat régional"
    : "Climat régional · sols hérités";
}

/** Build polygon + point feature collections by merging metadata + geometry. */
function buildCollections(): {
  polygons: FeatureCollection<MultiPolygon, AreaFeatureProps>;
  points: FeatureCollection<Point, AreaFeatureProps>;
  labels: FeatureCollection<Point, AreaFeatureProps>;
} {
  const polygons: Feature<MultiPolygon, AreaFeatureProps>[] = [];
  const points: Feature<Point, AreaFeatureProps>[] = [];
  const labels: Feature<Point, AreaFeatureProps>[] = [];

  for (const area of WINE_AREAS) {
    const parent = area.parentId ? getArea(area.parentId) : undefined;
    const geom = area.geoJsonId ? AREA_GEOMETRIES[area.geoJsonId] : undefined;
    const props: AreaFeatureProps = {
      id: area.id,
      name: area.name,
      level: area.level,
      parentName: parent?.name ?? "—",
      regionType: REGION_TYPE_LABELS[area.regionType],
      rootRegionId: area.rootRegionId,
      color: colorFor(area),
      dataNote: dataNoteFor(area),
      hasContour: Boolean(geom),
    };

    if (geom) {
      polygons.push({ type: "Feature", id: area.id, properties: props, geometry: geom });
    } else {
      points.push({
        type: "Feature",
        id: area.id,
        properties: props,
        geometry: { type: "Point", coordinates: area.center },
      });
    }

    labels.push({
      type: "Feature",
      id: area.id,
      properties: props,
      geometry: { type: "Point", coordinates: area.center },
    });
  }

  return {
    polygons: { type: "FeatureCollection", features: polygons },
    points: { type: "FeatureCollection", features: points },
    labels: { type: "FeatureCollection", features: labels },
  };
}

const POLYGON_LEVELS: AreaLevel[] = [1, 2, 3];
const POINT_LEVELS: AreaLevel[] = [2, 3, 4];

/**
 * Filter for a synthetic layer: the requested level, minus every region that
 * already has real PostGIS contours. Without this, the rough editorial
 * footprint of e.g. Alsace (a near-rectangle) is painted right next to — and
 * on top of — the accurate INAO outline streamed from the tiles (ADR 0012).
 */
function syntheticFilter(
  level: AreaLevel,
  coveredRegions: string[]
): maplibregl.FilterSpecification {
  const levelMatch = ["==", ["get", "level"], level];
  if (coveredRegions.length === 0) {
    return levelMatch as maplibregl.FilterSpecification;
  }
  return [
    "all",
    levelMatch,
    ["!", ["in", ["get", "rootRegionId"], ["literal", coveredRegions]]],
  ] as unknown as maplibregl.FilterSpecification;
}

/** Every synthetic layer id that carries a level filter. */
function syntheticLayerIds(): { id: string; level: AreaLevel }[] {
  const ids: { id: string; level: AreaLevel }[] = [];
  for (const level of POLYGON_LEVELS) {
    ids.push(
      { id: `areas-fill-${level}`, level },
      { id: `areas-line-${level}`, level },
      { id: `areas-label-${level}`, level }
    );
  }
  for (const level of POINT_LEVELS) {
    ids.push(
      { id: `points-circle-${level}`, level },
      { id: `points-label-${level}`, level }
    );
  }
  return ids;
}

/** Zoom we ease to after selecting an area of a given level (reveals children). */
const SELECT_ZOOM: Record<AreaLevel, number> = {
  1: 8.2,
  2: 8.8,
  3: 10.6,
  4: 12.5,
  5: 13.5,
};

/**
 * Zoom we ease to after clicking a REAL feature. Deeper than the synthetic
 * defaults so opening an appellation / cru naturally reveals the parcellaire
 * (parcels + lieux-dits ship from zoom 13).
 */
const REAL_SELECT_ZOOM: Record<AreaLevel, number> = {
  1: 8.5,
  2: 10.5,
  3: 12.2,
  4: 14,
  5: 14.5,
};

/** `wine-*` source-layer → MVT layer name in the tile (see migration 0007). */
const SRC = {
  region: "wine-areas-region",
  appellation: "wine-areas-appellation",
  cru: "wine-areas-cru",
  parcels: "wine-parcels",
  lieux: "wine-lieux-dits",
  // One point per lieu-dit (migration 0014): a clipped Alsace lieu-dit is a
  // multipolygon and a polygon label would repeat on every vine (ADR 0017).
  lieuxLabels: "wine-lieux-dits-labels",
  vines: VINE_SOURCE_LAYER,
} as const;

/**
 * Fill colour for a real (MVT) area: cru tier first, root region otherwise.
 * Mirrors {@link colorFor} so synthetic and real features never disagree.
 */
function regionColorExpression(): maplibregl.ExpressionSpecification {
  const pairs: string[] = [];
  for (const [id, color] of Object.entries(REGION_COLORS)) {
    pairs.push(id, color);
  }
  return [
    "match",
    ["get", "region_type"],
    "grand-cru",
    GRAND_CRU_COLOR,
    "premier-cru",
    PREMIER_CRU_COLOR,
    [
      "match",
      ["get", "root_region_id"],
      ...pairs,
      DEFAULT_AREA_COLOR,
    ],
  ] as unknown as maplibregl.ExpressionSpecification;
}

/**
 * Hierarchical MapLibre map. Areas are revealed progressively by zoom:
 * grandes régions (faible zoom) → sous-régions (intermédiaire) → villages /
 * crus (fort zoom). Hover shows a summary popup; click selects an area.
 *
 * Geometry comes from `src/data/geo.ts`, hierarchy/metadata from
 * `src/data/areas.ts` — merged here, not hardcoded. When Supabase is configured
 * for real data (`NEXT_PUBLIC_DATA_SOURCE=real`), real INAO/Cadastre contours
 * are streamed as PostGIS vector tiles from `/api/tiles/wine` and layered on
 * top; otherwise the synthetic layers are the sole source of truth.
 */
export function WineMap({
  selectedAreaId,
  selectedFeature,
  onSelectArea,
}: {
  selectedAreaId: string | null;
  /** Rich real selection — a domain outlines its declared places. */
  selectedFeature?: SelectedGeoFeature | null;
  onSelectArea: (areaId: string, feature?: SelectedGeoFeature) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const hoveredRef = useRef<{ source: string; id: string } | null>(null);
  const realHoverRef = useRef<{ sourceLayer: string; id: string } | null>(null);
  const realSelectedRef = useRef<{ sourceLayer: string; id: string } | null>(null);
  const onSelectRef = useRef(onSelectArea);
  onSelectRef.current = onSelectArea;

  /**
   * Root regions that already have real contours — their synthetic footprints
   * are filtered out so the two never stack (ADR 0012). Empty until the
   * coverage fetch resolves, and permanently empty on synthetic-only setups.
   */
  const [coveredRegions, setCoveredRegions] = useState<string[]>([]);
  const coveredRef = useRef<string[]>(coveredRegions);
  coveredRef.current = coveredRegions;

  const [basemap, setBasemap] = useState<BasemapId>(DEFAULT_BASEMAP);
  /** Reading used to colour the planted vines (ADR 0016). */
  const [vineColorBy, setVineColorBy] = useState<VineColorBy>("score_sun");
  const vineColorRef = useRef(vineColorBy);
  vineColorRef.current = vineColorBy;
  /** Subsoil readout for the last click, on every basemap (ADR 0013). */
  const [geology, setGeology] = useState<GeologyReadoutState>({ status: "idle" });
  /** In-flight subsoil request, aborted when a newer click lands. */
  const geologyReqRef = useRef<AbortController | null>(null);
  /**
   * Set once the `load` handler has built every wine layer. `isStyleLoaded()`
   * is NOT a substitute: it also reports false while tiles are still streaming,
   * and `map.once("load", …)` after `load` has fired never runs — which made a
   * basemap switch during tile loading silently do nothing.
   */
  const mapReadyRef = useRef(false);
  /** Basemap currently installed in the style (avoids a no-op reinstall). */
  const installedBasemapRef = useRef<BasemapId>(DEFAULT_BASEMAP);
  /** Original `line-*` paint, captured once so themes stay reversible. */
  const basePaintRef = useRef(new Map<string, { color: unknown; width: unknown }>());

  const collections = useMemo(buildCollections, []);

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
        sources: {
          // Default basemap (IGN Orthophotos, key-free). Swapped in place by
          // the basemap effect below — the wine layers never move (ADR 0011).
          [BASEMAP_SOURCE]: {
            type: "raster",
            tiles: BASEMAPS[DEFAULT_BASEMAP].tiles,
            tileSize: 256,
            attribution: BASEMAPS[DEFAULT_BASEMAP].attribution,
          },
        },
        layers: [
          { id: BG_LAYER, type: "background", paint: { "background-color": "#f6f1e7" } },
          {
            id: BASEMAP_LAYER,
            type: "raster",
            source: BASEMAP_SOURCE,
            paint: { "raster-opacity": BASEMAPS[DEFAULT_BASEMAP].opacity },
          },
        ],
      },
      center: FRANCE_CENTER,
      zoom: 4.9,
      maxZoom: 16,
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");

    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 12,
      className: "wine-popup",
    });
    popupRef.current = popup;

    const interactiveLayers: string[] = [];

    map.on("load", () => {
      map.addSource("areas", {
        type: "geojson",
        data: collections.polygons,
        promoteId: "id",
      });
      map.addSource("area-points", {
        type: "geojson",
        data: collections.points,
        promoteId: "id",
      });
      map.addSource("area-labels", {
        type: "geojson",
        data: collections.labels,
        promoteId: "id",
      });

      // --- polygon layers, one set per level (progressive by zoom) ----------
      for (const level of POLYGON_LEVELS) {
        const band = LEVEL_ZOOM[level];
        const fillId = `areas-fill-${level}`;
        const lineId = `areas-line-${level}`;
        const labelId = `areas-label-${level}`;
        const filter = syntheticFilter(level, coveredRef.current);
        const baseOpacity = level === 1 ? 0.16 : level === 2 ? 0.26 : 0.36;

        map.addLayer({
          id: fillId,
          type: "fill",
          source: "areas",
          filter,
          minzoom: band.min,
          maxzoom: band.max,
          paint: {
            "fill-color": ["get", "color"],
            "fill-opacity": [
              "case",
              ["boolean", ["feature-state", "selected"], false],
              0.55,
              ["boolean", ["feature-state", "hover"], false],
              baseOpacity + 0.16,
              baseOpacity,
            ],
          },
        });

        map.addLayer({
          id: lineId,
          type: "line",
          source: "areas",
          filter,
          minzoom: band.min,
          maxzoom: band.max,
          paint: {
            "line-color": ["get", "color"],
            "line-width": [
              "case",
              ["boolean", ["feature-state", "selected"], false],
              3,
              ["boolean", ["feature-state", "hover"], false],
              2,
              1.2,
            ],
            "line-opacity": 0.85,
          },
        });

        map.addLayer({
          id: labelId,
          type: "symbol",
          source: "area-labels",
          filter,
          minzoom: band.min,
          maxzoom: band.max,
          layout: {
            "text-field": ["get", "name"],
            "text-size": level === 1 ? 14 : level === 2 ? 12 : 11,
            "text-font": ["Open Sans Semibold"],
            "text-allow-overlap": false,
            "text-padding": 6,
            "text-max-width": 8,
          },
          paint: {
            "text-color": "#4a1b26",
            "text-halo-color": "#fbf7ef",
            "text-halo-width": 1.6,
          },
        });

        interactiveLayers.push(fillId);
      }

      // --- point layers for areas without a contour yet ---------------------
      for (const level of POINT_LEVELS) {
        const band = LEVEL_ZOOM[level];
        const circleId = `points-circle-${level}`;
        const labelId = `points-label-${level}`;
        const filter = syntheticFilter(level, coveredRef.current);

        map.addLayer({
          id: circleId,
          type: "circle",
          source: "area-points",
          filter,
          minzoom: band.min,
          maxzoom: band.max,
          paint: {
            "circle-radius": [
              "case",
              ["boolean", ["feature-state", "selected"], false],
              7,
              ["boolean", ["feature-state", "hover"], false],
              6,
              4.5,
            ],
            "circle-color": ["get", "color"],
            "circle-stroke-color": "#fbf7ef",
            "circle-stroke-width": 1.5,
            "circle-opacity": 0.9,
          },
        });

        map.addLayer({
          id: labelId,
          type: "symbol",
          source: "area-labels",
          filter,
          minzoom: band.min,
          maxzoom: band.max,
          layout: {
            "text-field": ["get", "name"],
            "text-size": 11,
            "text-font": ["Open Sans Semibold"],
            "text-offset": [0, 1.1],
            "text-anchor": "top",
            "text-allow-overlap": false,
            "text-optional": true,
          },
          paint: {
            "text-color": "#4a1b26",
            "text-halo-color": "#fbf7ef",
            "text-halo-width": 1.6,
          },
        });

        interactiveLayers.push(circleId);
      }

      // --- interactions (synthetic) ----------------------------------------
      const pick = (features?: MapGeoJSONFeature[]) =>
        features?.[0] as MapGeoJSONFeature | undefined;

      const sourceForLayer = (layerId: string) =>
        layerId.startsWith("points-") ? "area-points" : "areas";

      const setHover = (source: string, id: string | null) => {
        if (hoveredRef.current) {
          map.setFeatureState(hoveredRef.current, { hover: false });
          hoveredRef.current = null;
        }
        if (id) {
          hoveredRef.current = { source, id };
          map.setFeatureState({ source, id }, { hover: true });
        }
      };

      // Clear a real (PostGIS) selection highlight when a synthetic area wins.
      const clearRealSelection = () => {
        if (realSelectedRef.current) {
          map.setFeatureState(
            { source: "wine", ...realSelectedRef.current },
            { selected: false }
          );
          realSelectedRef.current = null;
        }
      };

      for (const layerId of interactiveLayers) {
        map.on("mousemove", layerId, (e) => {
          const f = pick(e.features);
          if (!f) return;
          map.getCanvas().style.cursor = "pointer";
          const p = f.properties as unknown as AreaFeatureProps;
          setHover(sourceForLayer(layerId), String(p.id));
          popup
            .setLngLat(e.lngLat)
            .setHTML(
              `<div class="wp-name">${p.name}</div>` +
                `<div class="wp-meta">${p.regionType} · niveau ${p.level}</div>` +
                (p.parentName && p.parentName !== "—"
                  ? `<div class="wp-meta">Région parente : ${p.parentName}</div>`
                  : "") +
                `<div class="wp-data">${p.dataNote}</div>` +
                `<div class="wp-hint">Cliquer pour explorer</div>`
            )
            .addTo(map);
        });
        map.on("mouseleave", layerId, () => {
          map.getCanvas().style.cursor = "";
          setHover("areas", null);
          popup.remove();
        });
        map.on("click", layerId, (e) => {
          const f = pick(e.features);
          const id = f?.properties?.id as string | undefined;
          if (id) {
            clearRealSelection();
            onSelectRef.current(id);
          }
        });
      }

      // --- real PostGIS vector tiles (layered on top) ----------------------
      if (USE_REAL) {
        addRealLayers(map, popup, {
          vineColorBy: vineColorRef.current,
          realHoverRef,
          realSelectedRef,
          onSelect: (id, feature, lngLat, level) => {
            // Clear the synthetic highlight; real selection wins.
            setHover("areas", null);
            onSelectRef.current(id, feature);
            const target = Math.max(
              map.getZoom(),
              REAL_SELECT_ZOOM[(level ?? 3) as AreaLevel] ?? 13
            );
            map.easeTo({ center: lngLat, zoom: target, duration: 700 });
          },
        });

        // Reference domains: cellar markers, click opens the domain card.
        Promise.all(DOMAIN_REGIONS.map(fetchDomains)).then((lists) => {
          const domains = lists.flat();
          if (!domains.length || !mapRef.current) return;
          const byId = new Map(domains.map((d) => [d.id, d]));
          addDomainLayers(map, domains);
          map.on("mousemove", DOMAIN_CIRCLE, (e) => {
            const d = byId.get(String(e.features?.[0]?.properties?.id));
            if (!d) return;
            map.getCanvas().style.cursor = "pointer";
            popup.setLngLat([d.lon, d.lat]).setHTML(domainPopupHtml(d)).addTo(map);
          });
          map.on("mouseleave", DOMAIN_CIRCLE, () => {
            map.getCanvas().style.cursor = "";
            popup.remove();
          });
          map.on("click", DOMAIN_CIRCLE, (e) => {
            const d = byId.get(String(e.features?.[0]?.properties?.id));
            if (d) onSelectRef.current(d.id, domainFeature(d));
          });
        });
      }

      applySelection(map, selectedAreaId);
      mapReadyRef.current = true;
    });

    return () => {
      popup.remove();
      mapReadyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collections]);

  // --- real-contour coverage -------------------------------------------------
  // Fetched once. A failure leaves the list empty, i.e. the synthetic layers
  // stay on — never the other way round, so the map is never left blank.
  useEffect(() => {
    if (!USE_REAL) return;
    const ctrl = new AbortController();
    fetch("/api/wine/coverage", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : { regions: [] }))
      .then((body: { regions?: unknown }) => {
        const regions = Array.isArray(body.regions)
          ? body.regions.filter((r): r is string => typeof r === "string")
          : [];
        if (regions.length) setCoveredRegions(regions);
      })
      .catch(() => {
        /* synthetic layers stay visible */
      });
    return () => ctrl.abort();
  }, []);

  // Re-filter the synthetic layers whenever coverage changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      for (const { id, level } of syntheticLayerIds()) {
        if (map.getLayer(id)) {
          map.setFilter(id, syntheticFilter(level, coveredRegions));
        }
      }
    };

    if (mapReadyRef.current) apply();
    else map.once("load", apply);
  }, [coveredRegions]);

  // Reflect selection + ease toward the selected area to reveal its children.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const run = () => {
      applySelection(map, selectedAreaId);
      const area = getArea(selectedAreaId);
      if (area) {
        const target = Math.max(map.getZoom(), SELECT_ZOOM[area.level]);
        map.easeTo({ center: area.center, zoom: target, duration: 700 });
      }
    };

    if (mapReadyRef.current) run();
    else map.once("idle", run);
  }, [selectedAreaId]);

  // A selected domain outlines the grands crus and lieux-dits it declares
  // (ADR 0019) and flies to its cellar; places off-screen become chips.
  const selectedDomain = selectedFeature?.kind === "domain" ? selectedFeature.domain ?? null : null;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !USE_REAL) return;
    const run = () => {
      highlightDomain(map, selectedDomain);
      if (selectedDomain) {
        map.easeTo({
          center: [selectedDomain.lon, selectedDomain.lat],
          zoom: Math.max(map.getZoom(), 12.5),
          duration: 700,
        });
      }
    };
    if (mapReadyRef.current) run();
    else map.once("idle", run);
  }, [selectedDomain]);

  useEffect(() => {
    const map = mapRef.current;
    if (map && mapReadyRef.current) setVineColor(map, vineColorBy);
  }, [vineColorBy]);

  // --- basemap switching -----------------------------------------------------
  // Only the raster basemap layer is replaced, always *below* the wine layers:
  // the GeoJSON / MVT sources are never touched, so nothing reloads (ADR 0011).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const def = BASEMAPS[basemap];

    const install = () => {
      if (installedBasemapRef.current !== basemap) {
        installBasemap(map, basemap);
        installedBasemapRef.current = basemap;
      }
      applyWineTheme(map, def.theme, basePaintRef.current);
    };

    if (mapReadyRef.current) install();
    else map.once("load", install);
  }, [basemap]);

  // --- click-to-read the subsoil (every basemap, ADR 0013) -------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const onClick = (e: maplibregl.MapMouseEvent) => {
      geologyReqRef.current?.abort();
      const rockCtrl = new AbortController();
      geologyReqRef.current = rockCtrl;
      setGeology({ status: "loading" });

      // `/api/geology` picks the scale: BD Charm-50 at 1/50 000 inside the
      // ingested départements, BRGM 1/1 000 000 elsewhere (ADR 0014). The
      // browser never talks to BRGM or Supabase directly.
      const url =
        `/api/geology?lon=${e.lngLat.lng.toFixed(6)}` +
        `&lat=${e.lngLat.lat.toFixed(6)}`;

      fetch(url, { signal: rockCtrl.signal })
        .then((r) => r.json())
        .then((payload) => {
          const answer = parseSubsoilResponse(payload);
          setGeology(answer ? { status: "ready", answer } : { status: "empty" });
        })
        .catch((err) => {
          if ((err as Error).name === "AbortError") return;
          setGeology({ status: "error" });
        });
    };

    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
    };
  }, []);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      <BasemapSwitcher basemap={basemap} onBasemapChange={setBasemap} />
      {USE_REAL && <VineColorSwitcher value={vineColorBy} onChange={setVineColorBy} />}
      {USE_REAL && <OffscreenPlaces map={mapRef.current} domain={selectedDomain} />}
      <GeologyReadout
        geology={geology}
        onClose={() => {
          geologyReqRef.current?.abort();
          setGeology({ status: "hidden" });
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Basemap + relief plumbing                                                  */
/* -------------------------------------------------------------------------- */

/** Id of the lowest wine layer — everything basemap-ish is inserted before it. */
function firstWineLayerId(map: MlMap): string | undefined {
  return map.getStyle().layers?.find((l) => !BASE_LAYER_IDS.has(l.id))?.id;
}

/** Replace the raster basemap in place, keeping it under every wine layer. */
function installBasemap(map: MlMap, id: BasemapId) {
  const def = BASEMAPS[id];

  if (map.getLayer(BASEMAP_LAYER)) map.removeLayer(BASEMAP_LAYER);
  if (map.getSource(BASEMAP_SOURCE)) map.removeSource(BASEMAP_SOURCE);

  map.addSource(BASEMAP_SOURCE, {
    type: "raster",
    tiles: def.tiles,
    tileSize: 256,
    attribution: def.attribution,
  });
  map.addLayer(
    {
      id: BASEMAP_LAYER,
      type: "raster",
      source: BASEMAP_SOURCE,
      paint: { "raster-opacity": def.opacity },
    },
    firstWineLayerId(map)
  );
}

/**
 * Repaint the wine layers for the active basemap. Geometry, sources and
 * zoom bands are untouched — only outline / label / marker colours, which are
 * what becomes unreadable over imagery or the geological map.
 */
function applyWineTheme(
  map: MlMap,
  theme: WineLayerTheme,
  basePaint: Map<string, { color: unknown; width: unknown }>
) {
  for (const layer of map.getStyle().layers ?? []) {
    if (
      BASE_LAYER_IDS.has(layer.id) ||
      THEME_EXEMPT_LAYERS.has(layer.id) ||
      HIERARCHY_LAYERS.has(layer.id)
    )
      continue;

    if (layer.type === "line") {
      let base = basePaint.get(layer.id);
      if (!base) {
        base = {
          color: map.getPaintProperty(layer.id, "line-color"),
          width: map.getPaintProperty(layer.id, "line-width"),
        };
        basePaint.set(layer.id, base);
      }
      // The theme repaints every outline one colour so it survives imagery.
      // Grands crus keep their tier colour: it is the only cue that separates
      // them from the appellations they sit inside (ADR 0012).
      map.setPaintProperty(
        layer.id,
        "line-color",
        (theme.lineColor
          ? [
              "match",
              ["get", "region_type"],
              "grand-cru",
              GRAND_CRU_COLOR,
              "premier-cru",
              PREMIER_CRU_COLOR,
              theme.lineColor,
            ]
          : base.color) as never
      );
      map.setPaintProperty(
        layer.id,
        "line-width",
        theme.lineWidthBoost === 0
          ? (base.width as never)
          : (["+", base.width, theme.lineWidthBoost] as never)
      );
      map.setPaintProperty(layer.id, "line-opacity", theme.lineOpacity);
      continue;
    }

    if (layer.type === "symbol") {
      map.setPaintProperty(layer.id, "text-color", theme.labelColor);
      map.setPaintProperty(layer.id, "text-halo-color", theme.labelHaloColor);
      map.setPaintProperty(layer.id, "text-halo-width", theme.labelHaloWidth);
      continue;
    }

    if (layer.type === "circle") {
      map.setPaintProperty(
        layer.id,
        "circle-stroke-color",
        theme.circleStrokeColor
      );
    }
  }
  // Region / secteur / village / cru inks keep their own colours (ADR 0022).
  applyHierarchyTheme(map, theme);
}

function domainPopupHtml(d: WineDomain): string {
  return (
    `<div class="wp-name">${d.name}</div>` +
    `<div class="wp-meta">${d.commune ?? ""}${d.surfaceHa != null ? ` · ${d.surfaceHa} ha déclarés` : ""}</div>` +
    `<div class="wp-data">Score estimé ${d.scoreSun ?? "—"} · confiance ${d.scoreConfidence ?? "—"}</div>` +
    `<div class="wp-hint">Cliquer pour la fiche du domaine</div>`
  );
}

/** Apply the `selected` feature-state to the right feature across both sources. */
function applySelection(map: MlMap, selectedAreaId: string | null) {
  for (const area of WINE_AREAS) {
    const source = area.geoJsonId && AREA_GEOMETRIES[area.geoJsonId] ? "areas" : "area-points";
    map.setFeatureState(
      { source, id: area.id },
      { selected: area.id === selectedAreaId }
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Real PostGIS layers (MVT)                                                  */
/* -------------------------------------------------------------------------- */

interface RealLayerHandles {
  vineColorBy: VineColorBy;
  realHoverRef: React.MutableRefObject<{ sourceLayer: string; id: string } | null>;
  realSelectedRef: React.MutableRefObject<{ sourceLayer: string; id: string } | null>;
  onSelect: (
    id: string,
    feature: SelectedGeoFeature,
    lngLat: maplibregl.LngLat,
    level?: number
  ) => void;
}

type RealProps = Record<string, unknown>;

function str(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  return String(v);
}
function bool(v: unknown): boolean {
  return v === true || v === "true" || v === 1 || v === "1";
}
function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function provenanceOf(p: RealProps): GeoDataProvenance {
  return {
    sourceDatasetId: str(p.source_dataset_id),
    sourceType: (str(p.source_type) as GeoDataProvenance["sourceType"]) ?? "real",
    isOfficial: bool(p.is_official),
    isInformative: bool(p.is_informative),
    sourceUpdatedAt: null,
    license: str(p.license),
    attribution: str(p.attribution),
  };
}

/** Département prefix of a commune INSEE code → root region (real-data regions). */
const DEPT_REGION: Record<string, string> = {
  "67": "alsace", "68": "alsace",
  "21": "bourgogne", "71": "bourgogne", "89": "bourgogne",
  "51": "champagne", "10": "champagne", "02": "champagne", "52": "champagne", "77": "champagne",
};

/**
 * Root region of a clicked real feature, so the header / panel follow the
 * click (a parcel in Bourgogne must not leave the header on Alsace).
 */
function rootRegionOf(p: RealProps): string | undefined {
  const explicit = str(p.root_region_id) ?? str(p.area_root_region_id);
  if (explicit) return explicit;
  const insee = str(p.commune_insee);
  return insee ? DEPT_REGION[insee.slice(0, 2)] : undefined;
}

function featureFromProps(
  sourceLayer: string,
  p: RealProps
): SelectedGeoFeature {
  const provenance = provenanceOf(p);
  if (sourceLayer === SRC.vines) {
    const vinePlot = {
      id: String(p.id),
      rootRegionId: rootRegionOf(p) ?? "alsace",
      source: (str(p.source) ?? "rpg") as "rpg" | "bdtopo",
      isOrganic: p.is_organic == null ? null : bool(p.is_organic),
      communeName: str(p.commune_name),
      appellation: str(p.appellation),
      grandCru: str(p.grand_cru),
      cruLevel: (str(p.cru_level) as VinePlot["cruLevel"]) ?? null,
      premierCru: str(p.premier_cru),
      village: str(p.village),
      lieuDit: str(p.lieu_dit),
      areaHa: num(p.area_ha),
      altitudeM: num(p.altitude_m),
      slopePct: num(p.slope_pct),
      aspectDeg: num(p.aspect_deg),
      geolNotation: str(p.geol_notation),
      geolDescr: str(p.geol_descr),
      geolFamily: str(p.geol_family),
      soilName: str(p.soil_name),
      scoreSun: num(p.score_sun),
      scoreCool: num(p.score_cool),
      scoreComponents: parseComponents(p.score_components),
    };
    return {
      kind: "vine-plot",
      id: vinePlot.id,
      name: vinePlot.lieuDit
        ? `${vinePlot.lieuDit} · ${vinePlot.communeName ?? ""}`.trim()
        : `Vigne · ${vinePlot.communeName ?? ""}`.trim(),
      rootRegionId: vinePlot.rootRegionId,
      areaHa: vinePlot.areaHa,
      vinePlot,
      provenance: { ...provenance, isInformative: true, isOfficial: false },
    };
  }
  if (sourceLayer === SRC.parcels) {
    return {
      kind: "parcel",
      id: String(p.id),
      name: str(p.name) ?? str(p.parcel_ref) ?? "Parcelle",
      communeInsee: str(p.commune_insee),
      parcelRef: str(p.parcel_ref),
      areaHa: num(p.area_ha),
      cadastreSection: str(p.cadastre_section),
      cadastreNumero: str(p.cadastre_numero),
      inaoIdAire: str(p.inao_id_aire),
      rootRegionId: rootRegionOf(p),
      provenance,
    };
  }
  if (sourceLayer === SRC.lieux) {
    return {
      kind: "lieu-dit",
      id: String(p.id),
      name: str(p.name) ?? "Lieu-dit",
      communeInsee: str(p.commune_insee),
      parentId: str(p.wine_area_id),
      areaName: str(p.area_name),
      areaRegionType: str(p.area_region_type),
      cadastreSourceRef: str(p.cadastre_source_ref),
      rootRegionId: rootRegionOf(p),
      provenance,
    };
  }
  // area layers (region / appellation / cru)
  return {
    kind: "area",
    id: String(p.id),
    name: str(p.name) ?? "Aire",
    level: (num(p.level) ?? undefined) as AreaLevel | undefined,
    regionType: str(p.region_type) ?? undefined,
    rootRegionId: rootRegionOf(p),
    parentId: str(p.parent_id),
    provenance,
  };
}

function popupHtml(sourceLayer: string, f: SelectedGeoFeature): string {
  const badge = f.provenance.isOfficial ? "Limite officielle" : "Contour informatif";
  if (sourceLayer === SRC.vines && f.vinePlot) {
    const v = f.vinePlot;
    const fmt1 = (x: number | null, u: string) => (x == null ? "—" : `${Math.round(x)} ${u}`);
    return (
      `<div class="wp-name">${f.name}</div>` +
      `<div class="wp-meta">${cruLabel(v)}` +
      ` · ${v.areaHa != null ? v.areaHa.toFixed(2) : "—"} ha</div>` +
      `<div class="wp-meta">${rockFamilyLabel(v.geolFamily)} · pente ${fmt1(v.slopePct, "%")}` +
      ` · ${aspectLabel(v.aspectDeg, v.slopePct)} · ${fmt1(v.altitudeM, "m")}</div>` +
      `<div class="wp-data">Score ${v.scoreSun ?? "—"} (soleil) · ${v.scoreCool ?? "—"} (fraîcheur)</div>` +
      `<div class="wp-hint">Cliquer pour la fiche</div>`
    );
  }
  if (sourceLayer === SRC.parcels) {
    // INAO "parcellaire" is an aire délimitée per commune x denomination, not a
    // cadastral plot: `name` is the appellation. Say so instead of letting the
    // user read "Crémant d'Alsace" as a parcel name (ADR 0012).
    const ref = f.parcelRef ?? f.communeInsee;
    return (
      `<div class="wp-name">${f.name}</div>` +
      `<div class="wp-meta">Aire délimitée INAO${ref ? ` · commune ${ref}` : ""}</div>` +
      (f.areaHa ? `<div class="wp-meta">${f.areaHa.toFixed(2)} ha</div>` : "") +
      `<div class="wp-data">${badge}</div>` +
      `<div class="wp-hint">Cliquer pour la fiche</div>`
    );
  }
  if (sourceLayer === SRC.lieux) {
    const cru = f.areaRegionType
      ? f.areaRegionType === "grand-cru"
        ? "Grand Cru"
        : f.areaRegionType === "premier-cru"
        ? "Premier Cru"
        : ""
      : "";
    return (
      `<div class="wp-name">${f.name}</div>` +
      `<div class="wp-meta">Lieu-dit · ${f.communeInsee ?? "—"}</div>` +
      (f.areaName ? `<div class="wp-meta">${cru ? cru + " · " : ""}${f.areaName}</div>` : "") +
      `<div class="wp-data">${badge}</div>` +
      `<div class="wp-hint">Cliquer pour la fiche</div>`
    );
  }
  return (
    `<div class="wp-name">${f.name}</div>` +
    `<div class="wp-meta">${f.regionType ?? "Aire"} · niveau ${f.level ?? "—"}</div>` +
    `<div class="wp-data">${badge}</div>` +
    `<div class="wp-hint">Cliquer pour explorer</div>`
  );
}

/** Add the real (PostGIS/MVT) source, layers and interactions. */
function addRealLayers(
  map: MlMap,
  popup: Popup,
  handles: RealLayerHandles
) {
  map.addSource("wine", {
    type: "vector",
    // `v=` busts browser/CDN caches after geom ingest (hard refresh alone is not enough).
    tiles: [
      `${window.location.origin}/api/tiles/wine/{z}/{x}/{y}?v=${WINE_TILES_VERSION}`,
    ],
    minzoom: 0,
    maxzoom: 14,
    // Use the string `id` property as the MapLibre feature id (feature-state).
    promoteId: {
      [SRC.region]: "id",
      [SRC.appellation]: "id",
      [SRC.cru]: "id",
      [SRC.parcels]: "id",
      [SRC.lieux]: "id",
      [SRC.vines]: "id",
    },
  });

  const areaColor = regionColorExpression();
  // Region → secteurs → villages → crus, read progressively (ADR 0022).
  const interactive: { layerId: string; sourceLayer: string }[] = addAreaFills(map, areaColor);

  // Parcels (fine INAO parcellaire) — outline emphasis, high zoom only.
  map.addLayer({
    id: "real-fill-parcels",
    type: "fill",
    source: "wine",
    "source-layer": SRC.parcels,
    minzoom: 13,
    paint: {
      "fill-color": "#7c2d3a",
      "fill-opacity": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        0.5,
        ["boolean", ["feature-state", "hover"], false],
        0.35,
        0.18,
      ],
    },
  });
  map.addLayer({
    id: "real-line-parcels",
    type: "line",
    source: "wine",
    "source-layer": SRC.parcels,
    minzoom: 13,
    paint: { "line-color": "#7c2d3a", "line-width": 0.8, "line-opacity": 0.8 },
  });
  interactive.push({ layerId: "real-fill-parcels", sourceLayer: SRC.parcels });

  // Lieux-dits (cadastre) — tinted by the commune's GC/PC classification.
  const lieuColor: maplibregl.ExpressionSpecification = [
    "match",
    ["get", "area_region_type"],
    "grand-cru",
    GRAND_CRU_COLOR,
    "premier-cru",
    PREMIER_CRU_COLOR,
    "#9a8bb0",
  ] as unknown as maplibregl.ExpressionSpecification;

  map.addLayer({
    id: "real-fill-lieux",
    type: "fill",
    source: "wine",
    "source-layer": SRC.lieux,
    minzoom: 13,
    paint: {
      "fill-color": lieuColor,
      // An Alsace lieu-dit runs into forest and village: the planted vines
      // carry the colour, the lieu-dit only its outline and name (ADR 0016).
      // Keyed on the commune (67/68): most lieux-dits have no cru parent.
      "fill-opacity": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        0.55,
        ["boolean", ["feature-state", "hover"], false],
        ["case", VINE_REGION_COMMUNE, 0.12, 0.4],
        ["case", VINE_REGION_COMMUNE, 0, 0.22],
      ],
    },
  });
  map.addLayer({
    id: "real-line-lieux",
    type: "line",
    source: "wine",
    "source-layer": SRC.lieux,
    minzoom: 13,
    paint: { "line-color": "#7a6a3a", "line-width": 0.6, "line-opacity": 0.7 },
  });
  // Planted vines above the lieux-dits, below their names.
  addVineLayers(map, handles.vineColorBy);
  map.addLayer({
    id: "wine-lieux-dits-labels",
    type: "symbol",
    source: "wine",
    "source-layer": SRC.lieuxLabels,
    minzoom: 13.5,
    // A cadastral lieu-dit often bears its cru's name ("LES CAILLERETS" in
    // "Volnay premier cru Les Caillerets"): the cru label already says it.
    filter: [
      "!",
      [
        "all",
        ["in", ["coalesce", ["get", "area_region_type"], ""], ["literal", ["premier-cru", "grand-cru"]]],
        ["in", ["downcase", ["get", "name"]], ["downcase", ["coalesce", ["get", "area_name"], ""]]],
      ],
    ] as unknown as maplibregl.FilterSpecification,
    layout: {
      "text-field": ["get", "name"],
      "text-size": 9.5,
      "text-font": ["Open Sans Semibold"],
      "text-letter-spacing": 0.04,
      "text-allow-overlap": false,
      "text-optional": true,
      "text-max-width": 7,
    },
    paint: {
      "text-color": "#4b4a44",
      "text-halo-color": "#fbf7ef",
      "text-halo-width": 1.2,
    },
  });
  // Outlines and names of the hierarchy above the vines and the lieux-dits,
  // so a parent boundary is never buried (ADR 0022).
  addAreaOutlinesAndLabels(map, areaColor);
  interactive.push({ layerId: "real-fill-lieux", sourceLayer: SRC.lieux });
  interactive.push({ layerId: VINE_FILL, sourceLayer: SRC.vines });

  // Only the topmost interactive layer under the cursor answers: a vine plot
  // sits inside a lieu-dit inside a cru, and all three used to fire at once.
  const interactiveIds = interactive.map((i) => i.layerId);
  const isTopmost = (layerId: string, point: maplibregl.PointLike) =>
    map.queryRenderedFeatures(point, {
      // Domain markers are added later, above everything, by their own handlers.
      layers: map.getLayer(DOMAIN_CIRCLE) ? [...interactiveIds, DOMAIN_CIRCLE] : interactiveIds,
    })[0]?.layer.id === layerId;

  // --- hover / click on real layers --------------------------------------
  const setRealHover = (sourceLayer: string, id: string | null) => {
    if (handles.realHoverRef.current) {
      map.setFeatureState(
        { source: "wine", ...handles.realHoverRef.current },
        { hover: false }
      );
      handles.realHoverRef.current = null;
    }
    if (id) {
      handles.realHoverRef.current = { sourceLayer, id };
      map.setFeatureState({ source: "wine", sourceLayer, id }, { hover: true });
    }
  };

  for (const { layerId, sourceLayer } of interactive) {
    map.on("mousemove", layerId, (e) => {
      const raw = e.features?.[0];
      if (!raw || !isTopmost(layerId, e.point)) return;
      map.getCanvas().style.cursor = "pointer";
      const props = raw.properties as unknown as RealProps;
      const feature = featureFromProps(sourceLayer, props);
      setRealHover(sourceLayer, feature.id);
      popup.setLngLat(e.lngLat).setHTML(popupHtml(sourceLayer, feature)).addTo(map);
    });
    map.on("mouseleave", layerId, () => {
      map.getCanvas().style.cursor = "";
      setRealHover(sourceLayer, null);
      popup.remove();
    });
    map.on("click", layerId, (e) => {
      const raw = e.features?.[0];
      if (!raw || !isTopmost(layerId, e.point)) return;
      const props = raw.properties as unknown as RealProps;
      const feature = featureFromProps(sourceLayer, props);

      // Selection highlight on the real source.
      if (handles.realSelectedRef.current) {
        map.setFeatureState(
          { source: "wine", ...handles.realSelectedRef.current },
          { selected: false }
        );
      }
      handles.realSelectedRef.current = { sourceLayer, id: feature.id };
      map.setFeatureState(
        { source: "wine", sourceLayer, id: feature.id },
        { selected: true }
      );

      handles.onSelect(feature.id, feature, e.lngLat, feature.level);
    });
  }
}
