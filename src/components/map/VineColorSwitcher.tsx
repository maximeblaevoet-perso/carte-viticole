"use client";

import {
  ALTITUDE_RAMP,
  ASPECT_COLORS,
  ASPECT_SECTORS,
  GEOLOGY_GROUPS,
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
        <div key={label} className="flex items-start gap-1 text-[10px] leading-tight text-slate-600">
          <span className="mt-px h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color }} />
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

/** Geology legend: one titled block per group, scrollable when long. */
function GeologyLegend() {
  return (
    <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
      {GEOLOGY_GROUPS.map((g) => (
        <div key={g.label}>
          <p className="text-[10px] font-semibold text-slate-700">{g.label}</p>
          <Swatches items={g.families.map(([k, c]) => [ROCK_FAMILY_LABELS[k] ?? k, c])} />
        </div>
      ))}
    </div>
  );
}

/** Point at `r` from the centre, `deg` clockwise from north (SVG y points down). */
const polar = (c: number, r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return [c + r * Math.sin(a), c - r * Math.cos(a)];
};

/** Aspect legend drawn as a compass rose: one 45° sector per direction, flat in the centre. */
function AspectCompass() {
  const size = 132;
  const c = size / 2;
  const r0 = 15;
  const r1 = 48;
  const rLabel = 58;
  return (
    <div className="flex items-center gap-2">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        {ASPECT_SECTORS.map((dir, i) => {
          const from = i * 45 - 22.5;
          const to = from + 45;
          const [ax, ay] = polar(c, r1, from);
          const [bx, by] = polar(c, r1, to);
          const [cx2, cy2] = polar(c, r0, to);
          const [dx, dy] = polar(c, r0, from);
          const [lx, ly] = polar(c, rLabel, i * 45);
          const cardinal = i % 2 === 0;
          return (
            <g key={dir}>
              <path
                d={`M${ax},${ay} A${r1},${r1} 0 0 1 ${bx},${by} L${cx2},${cy2} A${r0},${r0} 0 0 0 ${dx},${dy} Z`}
                fill={ASPECT_COLORS[dir]}
                stroke="#ffffff"
                strokeWidth={1}
              >
                <title>{`Exposition ${dir} (${i * 45}°)`}</title>
              </path>
              <text
                x={lx}
                y={ly}
                textAnchor="middle"
                dominantBaseline="central"
                className={cardinal ? "fill-slate-800 text-[10px] font-semibold" : "fill-slate-500 text-[8px]"}
              >
                {dir}
              </text>
            </g>
          );
        })}
        <circle cx={c} cy={c} r={r0 - 1} fill={ASPECT_COLORS.plat} stroke="#ffffff" strokeWidth={1}>
          <title>Plat (pente &lt; 2 %)</title>
        </circle>
      </svg>
      <div className="space-y-1 text-[10px] leading-tight text-slate-500">
        <p>Côté où regarde la pente.</p>
        <p>Chaud au sud, frais au nord.</p>
        <p className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: ASPECT_COLORS.plat }} />
          Plat (&lt; 2 %)
        </p>
      </div>
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
  else if (value === "exposition") legend = <AspectCompass />;
  else if (value === "geologie") legend = <GeologyLegend />;
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
    <div className={`pointer-events-auto absolute bottom-8 left-3 z-10 ${value === "geologie" ? "w-72" : "w-56"} rounded-lg border border-slate-200 bg-white/95 p-2 text-xs shadow-md ring-1 ring-black/5`}>
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
