"use client";

import { BASEMAPS, BASEMAP_ORDER } from "@/lib/basemaps";
import type { BasemapId } from "@/lib/basemaps";

/** Discreet on-map control: pick the basemap (Aérien / Plan / Géologie). */
export function BasemapSwitcher({
  basemap,
  onBasemapChange,
}: {
  basemap: BasemapId;
  onBasemapChange: (id: BasemapId) => void;
}) {
  return (
    <div
      className="pointer-events-auto absolute right-3 top-3 z-10 flex overflow-hidden rounded-lg border border-slate-200 bg-white text-xs shadow-md ring-1 ring-black/5"
      role="group"
      aria-label="Fond de carte"
    >
      {BASEMAP_ORDER.map((id) => {
        const def = BASEMAPS[id];
        const active = id === basemap;
        return (
          <button
            key={id}
            type="button"
            title={def.hint}
            aria-pressed={active}
            onClick={() => onBasemapChange(id)}
            className={
              "px-2.5 py-1.5 font-medium transition-colors " +
              (active
                ? "bg-wine-700 text-white"
                : "text-slate-600 hover:bg-wine-50 hover:text-wine-800")
            }
          >
            {def.label}
          </button>
        );
      })}
    </div>
  );
}
