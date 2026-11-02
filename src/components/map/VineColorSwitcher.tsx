"use client";

import {
  ALTITUDE_RAMP,
  ASPECT_COLORS,
  FAMILY_COLORS,
  SLOPE_RAMP,
  VINE_COLOR_OPTIONS,
} from "@/components/map/vineLayers";
import type { VineColorBy } from "@/components/map/vineLayers";
import { ROCK_FAMILY_LABELS, SCORE_RAMP } from "@/lib/terroir-score";

function Ramp({ stops, unit }: { stops: [number, string][]; unit: string }) {
  return (
    <div>
      <div
        className="h-2 w-full rounded"
        style={{ background: `linear-gradient(90deg, ${stops.map((s) => s[1]).join(",")})` }}
      />
      <div className="mt-0.5 flex justify-between text-[10px] text-slate-500">
        <span>{stops[0][0]}{unit}</span>
        <span>{stops[stops.length - 1][0]}{unit}</span>
      </div>
    </div>
  );
}

function Swatches({ items }: { items: [string, string][] }) {
  return (
    <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
      {items.map(([label, color]) => (
        <div key={label} className="flex items-center gap-1 text-[10px] text-slate-600">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color }} />
          <span className="truncate">{label}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Colour the planted vines by score, geology, slope, aspect, altitude or
 * estimated domain, with a compact legend. Vines show from zoom 13.
 */
export function VineColorSwitcher({
  value,
  onChange,
}: {
  value: VineColorBy;
  onChange: (v: VineColorBy) => void;
}) {
  let legend: React.ReactNode;
  if (value === "score_sun" || value === "score_cool") legend = <Ramp stops={SCORE_RAMP} unit="" />;
  else if (value === "pente") legend = <Ramp stops={SLOPE_RAMP} unit=" %" />;
  else if (value === "altitude") legend = <Ramp stops={ALTITUDE_RAMP} unit=" m" />;
  else if (value === "exposition") legend = <Swatches items={Object.entries(ASPECT_COLORS)} />;
  else if (value === "geologie")
    legend = (
      <Swatches
        items={Object.entries(FAMILY_COLORS).map(([k, c]) => [ROCK_FAMILY_LABELS[k] ?? k, c])}
      />
    );
  else
    legend = (
      <Swatches
        items={[
          ["Attribuée (proximité)", "#d81b60"],
          ["Attribuée (grand cru déclaré)", "#7b1fa2"],
          ["Non attribuée", "#cfcfcf"],
        ]}
      />
    );

  return (
    <div className="pointer-events-auto absolute bottom-8 left-3 z-10 w-56 rounded-lg border border-slate-200 bg-white/95 p-2 text-xs shadow-md ring-1 ring-black/5">
      <label className="mb-1 flex items-center justify-between gap-2 font-medium text-slate-700">
        <span>Vignes plantées</span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as VineColorBy)}
          className="rounded border border-slate-300 bg-white px-1 py-0.5 text-xs"
        >
          {VINE_COLOR_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {legend}
      <p className="mt-1 text-[10px] text-slate-400">Visibles à partir du zoom 13 (RPG + BD TOPO).</p>
    </div>
  );
}
