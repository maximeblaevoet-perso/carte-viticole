"use client";

import { BRGM_ATTRIBUTION } from "@/lib/basemaps";
import { plainSubsoil } from "@/lib/geology-info";
import type { GeologyInfo } from "@/lib/geology-info";

export type GeologyReadoutState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "empty" }
  | { status: "ready"; info: GeologyInfo };

/**
 * Reads out the subsoil under the last clicked point.
 *
 * Shown on **every** basemap (ADR 0013), not just the geological one: the rock
 * under a plot is what makes a terroir, and that question is asked just as
 * often while looking at the aerial imagery or the plan. The BRGM query does
 * not depend on the basemap, only on the clicked coordinates.
 *
 * The wording is deliberately plain French ("Sous-sol de gneiss" + one line of
 * explanation, see `plainSubsoil`), not the raw BRGM heading.
 *
 * The precision caveat is part of the card, not a footnote: the colours come
 * from the 1/50 000 map, the wording from the 1/1 000 000 lithology — the only
 * BRGM layer that answers a point query (see `src/lib/geology-info.ts`).
 */
export function GeologyReadout({ state }: { state: GeologyReadoutState }) {
  return (
    <div className="pointer-events-none absolute right-3 top-[52px] z-10 w-[222px] rounded-lg border border-slate-200 bg-white/95 p-2.5 text-xs shadow-md ring-1 ring-black/5">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        Sous-sol
      </div>

      {state.status === "idle" && (
        <p className="text-slate-500">
          Cliquez sur la carte pour lire la nature du sous-sol.
        </p>
      )}

      {state.status === "loading" && (
        <p className="text-slate-400">Lecture en cours…</p>
      )}

      {state.status === "empty" && (
        <p className="text-slate-500">
          Pas de donnée à cet endroit (hors France métropolitaine ou en mer).
        </p>
      )}

      {state.status === "error" && (
        <p className="text-slate-500">
          Le service BRGM n’a pas répondu. Réessayez.
        </p>
      )}

      {state.status === "ready" && <ReadySubsoil info={state.info} />}
    </div>
  );
}

function ReadySubsoil({ info }: { info: GeologyInfo }) {
  const plain = plainSubsoil(info);
  return (
    <>
      <div className="font-bold leading-snug text-wine-900">{plain.phrase}</div>
      {plain.gloss && (
        <p className="mt-0.5 text-[11px] leading-snug text-slate-600">
          {plain.gloss}
        </p>
      )}
      {plain.rockClass && (
        <div className="mt-0.5 text-[10px] text-slate-400">
          {plain.rockClass}
        </div>
      )}
      <div className="mt-1.5 border-t border-slate-100 pt-1.5 text-[10px] leading-tight text-slate-400">
        Lithologie simplifiée au 1/1 000 000 — famille de roche, pas la
        formation exacte ni sa profondeur. {BRGM_ATTRIBUTION}
      </div>
    </>
  );
}
