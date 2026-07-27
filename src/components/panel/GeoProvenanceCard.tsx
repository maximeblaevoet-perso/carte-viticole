import { SourceBadge } from "@/components/SourceBadge";
import type { GeoDataProvenance } from "@/lib/types";

/** Friendly labels for the ingested geodata datasets (see migration 0005). */
const DATASET_LABELS: Record<string, string> = {
  "inao-siqo": "INAO — référentiel SIQO",
  "inao-aires-aop-igp": "INAO — aires & produits AOC/AOP/IGP",
  "inao-aires-geo": "INAO — aires géographiques",
  "inao-parcellaire": "INAO — parcellaire AOC viticole",
  "ign-rpg": "RPG — IGN",
  "etalab-cadastre": "Cadastre — Etalab / DGFiP",
};

function datasetLabel(id: string | null): string | null {
  if (!id) return null;
  return DATASET_LABELS[id] ?? id;
}

/**
 * Source / provenance block for a REAL geographic feature (area, parcel or
 * lieu-dit). Always shows where the shape comes from (INAO / Cadastre / RPG),
 * its licence and attribution, and a "donnée informative" disclaimer when the
 * geometry is not the official legal boundary.
 */
export function GeoProvenanceCard({
  provenance,
}: {
  provenance: GeoDataProvenance;
}) {
  const label = datasetLabel(provenance.sourceDatasetId);
  const showDisclaimer = provenance.isInformative && !provenance.isOfficial;

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-700">
          {label ?? "Source géographique"}
        </span>
        <SourceBadge sourceType={provenance.sourceType} />
      </div>

      <dl className="mt-2 space-y-1 text-[11px] text-slate-500">
        {provenance.attribution && (
          <div className="flex gap-1">
            <dt className="text-slate-400">Attribution :</dt>
            <dd className="text-slate-600">{provenance.attribution}</dd>
          </div>
        )}
        {provenance.license && (
          <div className="flex gap-1">
            <dt className="text-slate-400">Licence :</dt>
            <dd className="text-slate-600">{provenance.license}</dd>
          </div>
        )}
        <div className="flex gap-1">
          <dt className="text-slate-400">Statut :</dt>
          <dd className="text-slate-600">
            {provenance.isOfficial ? "Limite officielle" : "Contour informatif"}
          </dd>
        </div>
      </dl>

      {showDisclaimer && (
        <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] leading-relaxed text-amber-700">
          Donnée informative : les limites officielles font foi via les plans
          INAO / mairie.
        </p>
      )}
    </div>
  );
}
