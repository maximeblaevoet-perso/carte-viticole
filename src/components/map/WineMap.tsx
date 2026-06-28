"use client";

import { useEffect, useMemo, useRef } from "react";
import maplibregl, { Map as MlMap, MapGeoJSONFeature, Popup } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type {
  Feature,
  FeatureCollection,
  Point,
  Polygon,
} from "geojson";
import { WINE_AREAS, LEVEL_ZOOM, REGION_TYPE_LABELS, getArea } from "@/data/areas";
import { AREA_GEOMETRIES, DEFAULT_AREA_COLOR, REGION_COLORS } from "@/data/geo";
import type { AreaLevel, WineArea } from "@/lib/types";

const FRANCE_CENTER: [number, number] = [2.6, 46.3];

/** Properties carried by every map feature (geometry-agnostic). */
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
  polygons: FeatureCollection<Polygon, AreaFeatureProps>;
  points: FeatureCollection<Point, AreaFeatureProps>;
} {
  const polygons: Feature<Polygon, AreaFeatureProps>[] = [];
  const points: Feature<Point, AreaFeatureProps>[] = [];

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
  }

  return {
    polygons: { type: "FeatureCollection", features: polygons },
    points: { type: "FeatureCollection", features: points },
  };
}

const POLYGON_LEVELS: AreaLevel[] = [1, 2, 3];
const POINT_LEVELS: AreaLevel[] = [2, 3, 4];

/** Zoom we ease to after selecting an area of a given level (reveals children). */
const SELECT_ZOOM: Record<AreaLevel, number> = {
  1: 8.2,
  2: 10,
  3: 11.5,
  4: 12.5,
  5: 13.5,
};

/**
 * Hierarchical MapLibre map. Areas are revealed progressively by zoom:
 * grandes régions (faible zoom) → sous-régions (intermédiaire) → villages /
 * crus (fort zoom). Hover shows a summary popup; click selects an area.
 *
 * Geometry comes from `src/data/geo.ts`, hierarchy/metadata from
 * `src/data/areas.ts` — the two are merged here, not hardcoded.
 */
export function WineMap({
  selectedAreaId,
  onSelectArea,
}: {
  selectedAreaId: string | null;
  onSelectArea: (areaId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const hoveredRef = useRef<{ source: string; id: string } | null>(null);
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
      maxZoom: 14,
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
          source: "areas",
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
          source: "area-points",
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

      // --- interactions -----------------------------------------------------
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
          if (id) onSelectRef.current(id);
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
