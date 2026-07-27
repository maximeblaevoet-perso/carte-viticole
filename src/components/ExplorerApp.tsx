"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Header } from "@/components/Header";
import { RegionPanelContent } from "@/components/panel/RegionPanelContent";
import { BottomSheet } from "@/components/panel/BottomSheet";
import { getArea } from "@/data/areas";
import type { SelectedGeoFeature } from "@/lib/types";

// MapLibre touches `window`, so it must only render on the client.
const WineMap = dynamic(
  () => import("@/components/map/WineMap").then((m) => m.WineMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-slate-100 text-sm text-slate-400">
        Chargement de la carte...
      </div>
    ),
  }
);

const DEFAULT_YEAR = 2018;

export function ExplorerApp() {
  // The map now selects hierarchical *areas* (region → sous-région → village …).
  const [areaId, setAreaId] = useState<string | null>(null);
  // Rich selection for REAL (PostGIS) features not present in the seed tree
  // (real appellations/crus, fine parcels, lieux-dits). `null` = synthetic nav.
  const [geoFeature, setGeoFeature] = useState<SelectedGeoFeature | null>(null);
  const [year, setYear] = useState<number>(DEFAULT_YEAR);

  const selectArea = (id: string, feature?: SelectedGeoFeature) => {
    setAreaId(id);
    setGeoFeature(feature ?? null);
  };

  // The header region selector reflects the level-1 region of the selection
  // (from the seed tree, or the real feature's root region when applicable).
  const rootRegionId =
    getArea(areaId)?.rootRegionId ?? geoFeature?.rootRegionId ?? null;

  const open = areaId !== null || geoFeature !== null;

  return (
    <div className="flex h-screen flex-col">
      <Header
        regionId={rootRegionId}
        year={year}
        onRegionChange={selectArea}
        onYearChange={setYear}
      />

      <div className="relative flex min-h-0 flex-1">
        <div className="relative min-h-0 flex-1">
          <WineMap selectedAreaId={areaId} onSelectArea={selectArea} />

          {/* Mobile bottom sheet (hidden on desktop). */}
          <BottomSheet open={open}>
            <RegionPanelContent
              areaId={areaId}
              feature={geoFeature}
              year={year}
              onYearChange={setYear}
              onSelectArea={selectArea}
            />
          </BottomSheet>
        </div>

        {/* Desktop right-side panel. */}
        <aside className="hidden w-[380px] shrink-0 border-l border-slate-200 bg-white md:block">
          <RegionPanelContent
            areaId={areaId}
            feature={geoFeature}
            year={year}
            onYearChange={setYear}
            onSelectArea={selectArea}
          />
        </aside>
      </div>
    </div>
  );
}
