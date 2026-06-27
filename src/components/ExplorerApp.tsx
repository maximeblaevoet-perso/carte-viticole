"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Header } from "@/components/Header";
import { RegionPanelContent } from "@/components/panel/RegionPanelContent";
import { BottomSheet } from "@/components/panel/BottomSheet";

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
  const [regionId, setRegionId] = useState<string | null>(null);
  const [year, setYear] = useState<number>(DEFAULT_YEAR);

  return (
    <div className="flex h-screen flex-col">
      <Header
        regionId={regionId}
        year={year}
        onRegionChange={setRegionId}
        onYearChange={setYear}
      />

      <div className="relative flex min-h-0 flex-1">
        <div className="relative min-h-0 flex-1">
          <WineMap selectedRegionId={regionId} onSelectRegion={setRegionId} />

          {/* Mobile bottom sheet (hidden on desktop). */}
          <BottomSheet open={regionId !== null}>
            <RegionPanelContent
              regionId={regionId}
              year={year}
              onYearChange={setYear}
            />
          </BottomSheet>
        </div>

        {/* Desktop right-side panel. */}
        <aside className="hidden w-[380px] shrink-0 border-l border-slate-200 bg-white md:block">
          <RegionPanelContent
            regionId={regionId}
            year={year}
            onYearChange={setYear}
          />
        </aside>
      </div>
    </div>
  );
}
