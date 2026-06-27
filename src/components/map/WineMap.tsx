"use client";

import { useEffect, useRef } from "react";
import maplibregl, { Map as MlMap, MapGeoJSONFeature } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { REGIONS_GEOJSON, WINE_REGIONS } from "@/data/regions";

const FRANCE_CENTER: [number, number] = [2.6, 46.3];

/**
 * MapLibre map of the three V1 wine regions. Uses a free OSM raster basemap
 * (no API key required). Clicking a region polygon selects it.
 */
export function WineMap({
  selectedRegionId,
  onSelectRegion,
}: {
  selectedRegionId: string | null;
  onSelectRegion: (regionId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const onSelectRef = useRef(onSelectRegion);
  onSelectRef.current = onSelectRegion;

  // Initialise the map once.
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors",
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
      center: FRANCE_CENTER,
      zoom: 4.7,
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");

    map.on("load", () => {
      map.addSource("regions", {
        type: "geojson",
        data: REGIONS_GEOJSON,
        // Promote properties.id to the feature id so setFeatureState works.
        promoteId: "id",
      });

      map.addLayer({
        id: "regions-fill",
        type: "fill",
        source: "regions",
        paint: {
          "fill-color": "#9d2f44",
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            0.55,
            0.25,
          ],
        },
      });

      map.addLayer({
        id: "regions-outline",
        type: "line",
        source: "regions",
        paint: {
          "line-color": "#7c2335",
          "line-width": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            3,
            1.5,
          ],
        },
      });

      map.addLayer({
        id: "regions-label",
        type: "symbol",
        source: "regions",
        layout: {
          "text-field": ["get", "name"],
          "text-size": 13,
          "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
        },
        paint: {
          "text-color": "#4a1b26",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.5,
        },
      });

      const pickFeature = (
        features?: MapGeoJSONFeature[]
      ): string | undefined =>
        features?.[0]?.properties?.id as string | undefined;

      map.on("click", "regions-fill", (e) => {
        const id = pickFeature(e.features);
        if (id) onSelectRef.current(id);
      });
      map.on("mouseenter", "regions-fill", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "regions-fill", () => {
        map.getCanvas().style.cursor = "";
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Reflect the selected region as feature-state.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      for (const region of WINE_REGIONS) {
        map.setFeatureState(
          { source: "regions", id: region.id },
          { selected: region.id === selectedRegionId }
        );
      }
    };

    if (map.isStyleLoaded() && map.getSource("regions")) {
      apply();
    } else {
      map.once("idle", apply);
    }
  }, [selectedRegionId]);

  return <div ref={containerRef} className="h-full w-full" />;
}
