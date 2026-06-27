import { INDICATOR_META } from "@/lib/indicators";
import { fmtNumber } from "@/lib/format";
import type { ClimateIndicators } from "@/lib/types";

/** A handful of headline indicators shown as a compact grid in the panel. */
const PANEL_KEYS: (keyof ClimateIndicators)[] = [
  "growingSeasonTempC",
  "daysAbove30",
  "rainAprSepMm",
  "rainSepMm",
  "springFrostDays",
  "waterStressIndex",
];

export function KeyIndicators({
  indicators,
  keys = PANEL_KEYS,
}: {
  indicators: ClimateIndicators;
  keys?: (keyof ClimateIndicators)[];
}) {
  return (
    <dl className="grid grid-cols-2 gap-2">
      {keys.map((key) => {
        const meta = INDICATOR_META.find((m) => m.key === key)!;
        return (
          <div
            key={key}
            className="rounded-lg border border-slate-200 bg-white p-2.5"
          >
            <dt className="text-[11px] uppercase tracking-wide text-slate-500">
              {meta.label}
            </dt>
            <dd className="mt-0.5 text-lg font-semibold text-slate-900">
              {fmtNumber(indicators[key], meta.decimals)}
              {meta.unit && (
                <span className="ml-1 text-xs font-normal text-slate-500">
                  {meta.unit}
                </span>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
