"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Header, MobileRegionBar } from "@/components/Header";
import { RegionPanelContent } from "@/components/panel/RegionPanelContent";
import { BottomSheet } from "@/components/panel/BottomSheet";
import { getArea } from "@/data/areas";
import { fetchDomains } from "@/hooks/useDomains";
import { domainSelection } from "@/lib/terroir-score";
import { selectionFor, type SearchEntry, type SearchIndex } from "@/lib/search";
import type { MapFocus } from "@/components/map/WineMap";
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
  /** Camera request from the search: frame this place (ADR 0023). */
  const [focus, setFocus] = useState<MapFocus | null>(null);

  const selectArea = (id: string, feature?: SelectedGeoFeature) => {
    setAreaId(id);
    setGeoFeature(feature ?? null);
  };

  const pickSearchResult = (e: SearchEntry, index: SearchIndex) => {
    const frame = () =>
      setFocus({ id: e.id, bbox: e.bbox, type: e.type, level: e.level, seq: Date.now() });
    switch (e.kind) {
      case "seed":
        selectArea(e.id);
        frame();
        break;
      case "area":
      case "lieu-dit":
        selectArea(e.id, selectionFor(e, index) ?? undefined);
        frame();
        break;
      case "commune":
        // A commune is not a fiche: frame its vines, keep the selection.
        frame();
        break;
      case "domain":
        // The domain card + its declared places; the map flies to the cellar.
        if (e.rootRegionId) {
          fetchDomains(e.rootRegionId).then((list) => {
            const d = list.find((x) => x.id === e.id);
            if (d) selectArea(d.id, domainSelection(d));
            else frame();
          });
        }
        break;
    }
  };

  const open = areaId !== null || geoFeature !== null;
  const sheetTitle = geoFeature?.name ?? getArea(areaId)?.name;
  const closeSelection = () => {
    setAreaId(null);
    setGeoFeature(null);
  };

  return (
    <div className="flex h-screen supports-[height:100dvh]:h-[100dvh] flex-col">
      <Header year={year} onYearChange={setYear} onPick={pickSearchResult} />

      <div className="relative flex min-h-0 flex-1">
        <div className="relative min-h-0 flex-1">
          <WineMap
            selectedAreaId={areaId}
            selectedFeature={geoFeature}
            focus={focus}
            onSelectArea={selectArea}
          />

          {/* Mobile: region + vintage at the bottom (the header is hidden). */}
          <MobileRegionBar year={year} onYearChange={setYear} onPick={pickSearchResult} />

          {/* Mobile bottom sheet (hidden on desktop). */}
          <BottomSheet open={open} title={sheetTitle} onClose={closeSelection}>
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
