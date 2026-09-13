"use client";

import { BRGM_ATTRIBUTION } from "@/lib/basemaps";
import { plainSubsoil } from "@/lib/geology-info";
import type { GeologyInfo } from "@/lib/geology-info";
import { SOILGRIDS_ATTRIBUTION } from "@/lib/soil-texture";
import type { SoilTexture } from "@/lib/soil-texture";

export type GeologyReadoutState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "empty" }
  | { status: "ready"; info: GeologyInfo };

export type SoilReadoutState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "empty" }
  | { status: "ready"; texture: SoilTexture };

/**
 * Reads out what is under the last clicked point, from **two independent
 * sources stacked in one card** (ADR 0013):
 *
 * - *La roche* — BRGM simplified lithology at 1/1 000 000: the rock family.
 * - *La terre* — ISRIC SoilGrids: the texture of the first 30 cm, 250 m raster.
 *
 * They answer different questions at wildly different precisions, so each half
 * carries its own provenance line. Neither is ever presented as the other, and
 * either half may be missing while the other resolves: the two requests are
 * independent and fail independently.
 *
 * Shown on **every** basemap, not just the geological one: "what is my plot
 * sitting on?" is asked just as often over the aerial imagery. The queries
 * depend only on the clicked coordinates, never on the basemap.
 */
export function GeologyReadout({
  geology,
  soil,
}: {
  geology: GeologyReadoutState;
  soil: SoilReadoutState;
}) {
  return (
    <div className="pointer-events-none absolute right-3 top-[52px] z-10 w-[238px] rounded-lg border border-slate-200 bg-white/95 p-2.5 text-xs shadow-md ring-1 ring-black/5">
      <Section title="La roche (sous-sol)">
        <StatusLine
          state={geology.status}
          idle="Cliquez sur la carte pour lire la nature du sous-sol."
        />
        {geology.status === "ready" && <RockBody info={geology.info} />}
      </Section>

      {geology.status !== "idle" && (
        <Section title="La terre (0–30 cm)" separated>
          <StatusLine state={soil.status} idle="" />
          {soil.status === "ready" && <SoilBody texture={soil.texture} />}
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  separated,
  children,
}: {
  title: string;
  separated?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={separated ? "mt-2.5 border-t border-slate-200 pt-2" : ""}>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </div>
      {children}
    </div>
  );
}

/** Shared non-`ready` wording, so both halves report failure the same way. */
function StatusLine({
  state,
  idle,
}: {
  state: GeologyReadoutState["status"] | SoilReadoutState["status"];
  idle: string;
}) {
  if (state === "ready") return null;
  if (state === "idle") {
    return idle ? <p className="text-slate-500">{idle}</p> : null;
  }
  if (state === "loading") {
    return <p className="text-slate-400">Lecture en cours…</p>;
  }
  if (state === "empty") {
    return <p className="text-slate-500">Pas de donnée à cet endroit.</p>;
  }
  return <p className="text-slate-500">Service indisponible. Réessayez.</p>;
}

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
      {plain.rockClass && (
        <div className="mt-0.5 text-[10px] text-slate-400">
          {plain.rockClass}
        </div>
      )}
      <Provenance>
        {BRGM_ATTRIBUTION} — lithologie simplifiée au 1/1 000 000 : une famille
        de roche, pas la formation exacte ni sa profondeur.
      </Provenance>
    </>
  );
}

function SoilBody({ texture }: { texture: SoilTexture }) {
  return (
    <>
      <div className="font-bold leading-snug text-wine-900">
        {texture.label}
      </div>
      <p className="mt-0.5 text-[11px] leading-snug text-slate-600">
        {texture.gloss}
      </p>
      <div className="mt-0.5 text-[10px] text-slate-500">
        {texture.clay} % argile · {texture.silt} % limon · {texture.sand} %
        sable
        {texture.ph !== null && <> · pH {texture.ph.toFixed(1)}</>}
      </div>
      <Provenance>
        {SOILGRIDS_ATTRIBUTION} — modèle mondial, maille 250 m (6,25 ha) :
        valeur indicative à l’échelle du cru, pas un relevé de terrain.
      </Provenance>
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
