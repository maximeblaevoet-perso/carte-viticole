"use client";

import { useEffect, useMemo, useRef } from "react";
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
import type {
  AreaLevel,
  GeoDataProvenance,
  SelectedGeoFeature,
  WineArea,
} from "@/lib/types";

const FRANCE_CENTER: [number, number] = [2.6, 46.3];

/** True when real PostGIS vector tiles should be layered on top (ADR 0007). */
const USE_REAL = shouldUseSupabase();

/** Properties carried by every synthetic map feature (geometry-agnostic). */
interface AreaFeatureProps {
  id: string;
  name: string;
  level: AreaLevel;
  parentName: string;
  regionType: string;
  color: string;
  dataNote: string;
  hasContour: boolean;
}

function colorFor(area: WineArea): string {
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
  3: 13.2,
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
} as const;

/** Fill colour keyed by root region, matching the synthetic palette. */
function regionColorExpression(): maplibregl.ExpressionSpecification {
  const pairs: string[] = [];
  for (const [id, color] of Object.entries(REGION_COLORS)) {
    pairs.push(id, color);
  }
  return [
    "match",
    ["get", "root_region_id"],
    ...pairs,
    DEFAULT_AREA_COLOR,
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
  onSelectArea,
}: {
  selectedAreaId: string | null;
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

  const collections = useMemo(buildCollections, []);

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
        sources: {
          // Soft, low-saturation light basemap (key-free) for a premium feel.
          carto: {
            type: "raster",
            tiles: [
              "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
              "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
              "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
            ],
            tileSize: 256,
            attribution:
              "© OpenStreetMap contributors, © CARTO",
          },
        },
        layers: [
          { id: "bg", type: "background", paint: { "background-color": "#f6f1e7" } },
          { id: "carto", type: "raster", source: "carto", paint: { "raster-opacity": 0.85 } },
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
        const filter = ["==", ["get", "level"], level] as maplibregl.FilterSpecification;
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
        const filter = ["==", ["get", "level"], level] as maplibregl.FilterSpecification;

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
      }

      applySelection(map, selectedAreaId);
    });

    return () => {
      popup.remove();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collections]);

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

    if (map.isStyleLoaded() && map.getSource("areas")) run();
    else map.once("idle", run);
  }, [selectedAreaId]);

  return <div ref={containerRef} className="h-full w-full" />;
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

function featureFromProps(
  sourceLayer: string,
  p: RealProps
): SelectedGeoFeature {
  const provenance = provenanceOf(p);
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
    rootRegionId: str(p.root_region_id) ?? undefined,
    parentId: str(p.parent_id),
    provenance,
  };
}

function popupHtml(sourceLayer: string, f: SelectedGeoFeature): string {
  const badge = f.provenance.isOfficial ? "Limite officielle" : "Contour informatif";
  if (sourceLayer === SRC.parcels) {
    return (
      `<div class="wp-name">${f.name}</div>` +
      `<div class="wp-meta">Parcelle · ${f.communeInsee ?? "—"}</div>` +
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
    tiles: [`${window.location.origin}/api/tiles/wine/{z}/{x}/{y}`],
    minzoom: 0,
    maxzoom: 14,
    // Use the string `id` property as the MapLibre feature id (feature-state).
    promoteId: {
      [SRC.region]: "id",
      [SRC.appellation]: "id",
      [SRC.cru]: "id",
      [SRC.parcels]: "id",
      [SRC.lieux]: "id",
    },
  });

  const areaColor = regionColorExpression();
  const interactive: { layerId: string; sourceLayer: string }[] = [];

  const addAreaSet = (
    sourceLayer: string,
    minzoom: number,
    baseOpacity: number,
    labelSize: number
  ) => {
    const fillId = `real-fill-${sourceLayer}`;
    const lineId = `real-line-${sourceLayer}`;
    const labelId = `real-label-${sourceLayer}`;

    map.addLayer({
      id: fillId,
      type: "fill",
      source: "wine",
      "source-layer": sourceLayer,
      minzoom,
      paint: {
        "fill-color": areaColor,
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
      source: "wine",
      "source-layer": sourceLayer,
      minzoom,
      paint: {
        "line-color": areaColor,
        "line-width": [
          "case",
          ["boolean", ["feature-state", "selected"], false],
          2.6,
          ["boolean", ["feature-state", "hover"], false],
          1.8,
          1,
        ],
        "line-opacity": 0.9,
      },
    });
    map.addLayer({
      id: labelId,
      type: "symbol",
      source: "wine",
      "source-layer": sourceLayer,
      minzoom,
      layout: {
        "text-field": ["get", "name"],
        "text-size": labelSize,
        "text-font": ["Open Sans Semibold"],
        "text-allow-overlap": false,
        "text-padding": 6,
        "text-max-width": 8,
      },
      paint: {
        "text-color": "#3a1620",
        "text-halo-color": "#fbf7ef",
        "text-halo-width": 1.6,
      },
    });

    interactive.push({ layerId: fillId, sourceLayer });
  };

  addAreaSet(SRC.region, 0, 0.14, 14);
  addAreaSet(SRC.appellation, 7, 0.22, 12);
  addAreaSet(SRC.cru, 10, 0.3, 11);

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
    "#c2a13a",
    "premier-cru",
    "#d8be6a",
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
      "fill-opacity": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        0.55,
        ["boolean", ["feature-state", "hover"], false],
        0.4,
        0.22,
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
  map.addLayer({
    id: "wine-lieux-dits-labels",
    type: "symbol",
    source: "wine",
    "source-layer": SRC.lieux,
    minzoom: 13.5,
    layout: {
      "text-field": ["get", "name"],
      "text-size": 10,
      "text-font": ["Open Sans Semibold"],
      "text-allow-overlap": false,
      "text-optional": true,
      "text-max-width": 7,
    },
    paint: {
      "text-color": "#4a3b16",
      "text-halo-color": "#fbf7ef",
      "text-halo-width": 1.4,
    },
  });
  interactive.push({ layerId: "real-fill-lieux", sourceLayer: SRC.lieux });

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
      if (!raw) return;
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
      if (!raw) return;
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
