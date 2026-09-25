"use client";

import { BRGM_ATTRIBUTION } from "@/lib/basemaps";
import { plainFormation } from "@/lib/geology-formation";
import type { FormationInfo } from "@/lib/geology-formation";
import { plainSubsoil } from "@/lib/geology-info";
import type { GeologyInfo } from "@/lib/geology-info";
import type { SubsoilAnswer } from "@/lib/subsoil";

export type GeologyReadoutState =
  | { status: "idle" }
  /** Dismissed by the user; the next map click opens it again. */
  | { status: "hidden" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "empty" }
  | { status: "ready"; answer: SubsoilAnswer };

/**
 * Reads out the subsoil under the last clicked point: BRGM BD Charm-50 at
 * 1/50 000, falling back to the simplified 1/1 000 000 lithology outside the
 * ingested départements (ADR 0014). The topsoil-texture half (SoilGrids) was
 * removed in ADR 0015.
 *
 * Shown on **every** basemap, not just the geological one: "what is my plot
 * sitting on?" is asked just as often over the aerial imagery.
 *
 * Tapping anywhere on the card (or its ×) dismisses it: on a phone it covers
 * most of the map. The next map click brings it back.
 */
export function GeologyReadout({
  geology,
  onClose,
}: {
  geology: GeologyReadoutState;
  onClose: () => void;
}) {
  if (geology.status === "hidden") return null;
  return (
    <div
      onClick={onClose}
      title="Fermer"
      className="absolute right-3 top-[52px] z-10 w-[238px] cursor-pointer rounded-lg border border-slate-200 bg-white/95 p-2.5 text-xs shadow-md ring-1 ring-black/5"
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Sous-sol
        </span>
        <button
          type="button"
          aria-label="Fermer l’encart sous-sol"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="-m-1.5 flex h-7 w-7 items-center justify-center rounded text-base leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          ×
        </button>
      </div>
      <StatusLine state={geology.status} />
      {geology.status === "ready" &&
        (geology.answer.scale === "50k" ? (
          <FormationBody formation={geology.answer.formation} />
        ) : (
          <RockBody info={geology.answer.info} />
        ))}
    </div>
  );
}

function StatusLine({ state }: { state: GeologyReadoutState["status"] }) {
  if (state === "ready" || state === "hidden") return null;
  if (state === "idle") {
    return (
      <p className="text-slate-500">
        Cliquez sur la carte pour lire la nature du sous-sol.
      </p>
    );
  }
  if (state === "loading") {
    return <p className="text-slate-400">Lecture en cours…</p>;
  }
  if (state === "empty") {
    return <p className="text-slate-500">Pas de donnée à cet endroit.</p>;
  }
  return <p className="text-slate-500">Service indisponible. Réessayez.</p>;
}

/**
 * The 1/50 000 answer (BD Charm-50) — the default since ADR 0014.
 *
 * Rock family, what it means for a vine, then BRGM's own formation label with
 * its age and stratigraphic code, printed verbatim, never paraphrased.
 */
function FormationBody({ formation }: { formation: FormationInfo }) {
  const plain = plainFormation(formation);
  return (
    <>
      <div className="font-bold leading-snug text-wine-900">{plain.phrase}</div>
      {plain.gloss && (
        <p className="mt-0.5 text-[11px] leading-snug text-slate-600">
          {plain.gloss}
        </p>
      )}
      <div className="mt-1 text-[10px] leading-snug text-slate-500">
        {plain.formation}
        {plain.age && <> — {plain.age}</>}
        {formation.notation && (
          <span className="text-slate-400"> ({formation.notation})</span>
        )}
      </div>
      <Provenance>{BRGM_ATTRIBUTION}</Provenance>
    </>
  );
}

/**
 * The 1/1 000 000 fallback, outside the ingested départements. The scale stays
 * on the provenance line: at this scale a cru can be handed the lithology of
 * the massif next door (see `geology-info.ts`).
 */
function RockBody({ info }: { info: GeologyInfo }) {
  const plain = plainSubsoil(info);
  return (
    <>
      <div className="font-bold leading-snug text-wine-900">{plain.phrase}</div>
      {plain.gloss && (
        <p className="mt-0.5 text-[11px] leading-snug text-slate-600">
          {plain.gloss}
        </p>
      )}
      <Provenance>{BRGM_ATTRIBUTION} · 1/1 000 000, indicatif</Provenance>
    </>
  );
}

function Provenance({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-1.5 text-[10px] leading-tight text-slate-400">
      {children}
    </div>
  );
}
