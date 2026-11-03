"use client";

import { useEffect, useState } from "react";
import type { Map as MlMap } from "maplibre-gl";
import type { DomainPlace, WineDomain } from "@/lib/types";

const ARROWS = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];

/** Compass arrow from the map centre towards a point (approximate, fine at this scale). */
function arrowTo(map: MlMap, lon: number, lat: number): string {
  const c = map.getCenter();
  const dx = (lon - c.lng) * Math.cos((c.lat * Math.PI) / 180);
  const dy = lat - c.lat;
  const deg = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
  return ARROWS[Math.round(deg / 45) % 8];
}

const km = (m: number) =>
  (m / 1000).toLocaleString("fr-FR", { maximumFractionDigits: m < 10_000 ? 1 : 0 });

function bbox(p: DomainPlace): [[number, number], [number, number]] | null {
  if (!p.geometry) return null;
  const polys = p.geometry.type === "Polygon" ? [p.geometry.coordinates] : p.geometry.coordinates;
  let [w, s, e, n] = [180, 90, -180, -90];
  for (const poly of polys)
    for (const [x, y] of poly[0]) {
      w = Math.min(w, x); e = Math.max(e, x);
      s = Math.min(s, y); n = Math.max(n, y);
    }
  return [[w, s], [e, n]];
}

/**
 * Declared places of the selected domain that lie outside the view, as small
 * chips ("Rangen · 33 km ↓") instead of zooming out the whole map (ADR 0019).
 * A click flies to the place.
 */
export function OffscreenPlaces({ map, domain }: { map: MlMap | null; domain: WineDomain | null }) {
  const [chips, setChips] = useState<{ place: DomainPlace; arrow: string }[]>([]);

  useEffect(() => {
    if (!map || !domain) {
      setChips([]);
      return;
    }
    const places = domain.composition.filter((p) => p.lon != null && p.lat != null);
    const update = () => {
      const b = map.getBounds();
      setChips(
        places
          .filter((p) => !b.contains([p.lon!, p.lat!]))
          .map((p) => ({ place: p, arrow: arrowTo(map, p.lon!, p.lat!) }))
      );
    };
    update();
    map.on("moveend", update);
    return () => {
      map.off("moveend", update);
    };
  }, [map, domain]);

  if (!chips.length) return null;
  return (
    <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[60%] flex-wrap gap-1.5">
      {chips.map(({ place, arrow }) => (
        <button
          key={place.name}
          type="button"
          onClick={() => {
            const box = bbox(place);
            if (box) map?.fitBounds(box, { padding: 80, maxZoom: 15, duration: 900 });
          }}
          className="pointer-events-auto rounded-full border border-pink-300 bg-white/95 px-2.5 py-0.5 text-[11px] text-pink-800 shadow-sm hover:bg-pink-50"
          title="Lieu déclaré par le domaine, hors du cadre : cliquer pour y aller"
        >
          {place.name}
          {place.distanceM != null ? ` · ${km(place.distanceM)} km` : ""} {arrow}
        </button>
      ))}
    </div>
  );
}
