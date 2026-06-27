"use client";

import { YEARS } from "@/data/synthetic";

/**
 * Horizontal, scrollable year selector. Optionally shows a per-year intensity
 * dot (e.g. warmth) to give a quick visual scan across vintages.
 */
export function VintageTimeline({
  year,
  onChange,
  intensities,
}: {
  year: number;
  onChange: (year: number) => void;
  /** Optional map year -> 0..1 intensity used to tint each chip. */
  intensities?: Record<number, number>;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1">
      {YEARS.map((y) => {
        const selected = y === year;
        const intensity = intensities?.[y];
        return (
          <button
            key={y}
            type="button"
            onClick={() => onChange(y)}
            className={`relative shrink-0 rounded-md px-2 py-1 text-xs font-medium transition ${
              selected
                ? "bg-wine-600 text-white"
                : "bg-white text-slate-600 hover:bg-slate-100"
            } border border-slate-200`}
          >
            {y}
            {intensity !== undefined && !selected && (
              <span
                className="absolute inset-x-1 bottom-0.5 h-0.5 rounded-full"
                style={{
                  backgroundColor: `rgba(157, 47, 68, ${0.15 + intensity * 0.85})`,
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
