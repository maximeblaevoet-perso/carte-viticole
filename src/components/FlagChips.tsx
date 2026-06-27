import { FLAG_LABELS } from "@/lib/indicators";
import type { VintageProfileFlags } from "@/lib/types";

const RISK_FLAGS: (keyof VintageProfileFlags)[] = [
  "stressHydrique",
  "risquePluieVendanges",
  "gelPrintemps",
  "forteChaleur",
];

export function FlagChips({ flags }: { flags: VintageProfileFlags }) {
  const active = (Object.keys(flags) as (keyof VintageProfileFlags)[]).filter(
    (k) => flags[k]
  );

  if (active.length === 0) {
    return (
      <p className="text-xs text-slate-500">
        Aucun marqueur climatique notable.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {active.map((k) => {
        const isRisk = RISK_FLAGS.includes(k);
        return (
          <span
            key={k}
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              isRisk
                ? "bg-amber-100 text-amber-800"
                : "bg-wine-100 text-wine-700"
            }`}
          >
            {FLAG_LABELS[k]}
          </span>
        );
      })}
    </div>
  );
}
