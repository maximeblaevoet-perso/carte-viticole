"use client";

import { useState } from "react";
import { useDomains } from "@/hooks/useDomains";
import {
  CRITERIA,
  SCORE_GRID,
  SCORE_MODE_LABELS,
  aspectLabel,
  componentValue,
  domainSelection,
  rockFamilyLabel,
  scoreColor,
} from "@/lib/terroir-score";
import type {
  ScoreComponents,
  ScoreMode,
  SelectedGeoFeature,
  VinePlot,
  WineDomain,
} from "@/lib/types";

const fmt = (x: number | null | undefined, digits = 0, unit = "") =>
  x == null ? "—" : `${x.toLocaleString("fr-FR", { maximumFractionDigits: digits, minimumFractionDigits: digits })}${unit}`;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-xs">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className="text-right text-slate-800">{children}</span>
    </div>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</h3>
  );
}

function ScorePill({ score }: { score: number | null | undefined }) {
  return (
    <span
      className="inline-block min-w-[2.6rem] rounded px-1.5 py-0.5 text-center text-xs font-semibold text-slate-900"
      style={{ background: scoreColor(score) }}
    >
      {score == null ? "—" : Math.round(score)}
    </span>
  );
}

function ModeToggle({ mode, onChange }: { mode: ScoreMode; onChange: (m: ScoreMode) => void }) {
  return (
    <div className="flex overflow-hidden rounded border border-slate-200 text-[11px]">
      {(Object.keys(SCORE_MODE_LABELS) as ScoreMode[]).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={"px-2 py-0.5 " + (m === mode ? "bg-wine-700 text-white" : "text-slate-600 hover:bg-slate-50")}
        >
          {SCORE_MODE_LABELS[m]}
        </button>
      ))}
    </div>
  );
}

function ComponentBars({ c, mode }: { c: ScoreComponents; mode: ScoreMode }) {
  return (
    <div className="space-y-1">
      {CRITERIA.map(({ key, label }) => {
        const v = componentValue(c, key, mode);
        return (
          <div key={key} className="flex items-center gap-2 text-[11px]">
            <span className="w-20 shrink-0 text-slate-500">
              {label} <span className="text-slate-400">({SCORE_GRID.poids[key]})</span>
            </span>
            <div className="h-1.5 flex-1 rounded bg-slate-100">
              <div className="h-1.5 rounded bg-wine-600" style={{ width: `${Math.round(v * 100)}%` }} />
            </div>
            <span className="w-7 text-right text-slate-600">{Math.round(v * 100)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Card of one planted vine plot: place, terrain, score, estimated domain. */
export function VinePlotDetails({
  plot,
  onSelectDomain,
}: {
  plot: VinePlot;
  onSelectDomain: (id: string, feature: SelectedGeoFeature) => void;
}) {
  const [mode, setMode] = useState<ScoreMode>(SCORE_GRID.mode_defaut as ScoreMode);
  const domains = useDomains(plot.domainId ? "alsace" : null);
  const domain = domains.find((d) => d.id === plot.domainId);
  const score = mode === "soleil" ? plot.scoreSun : plot.scoreCool;

  return (
    <>
      <section className="space-y-1 rounded-lg border border-slate-200 p-2.5">
        <Row label="Appellation">{plot.grandCru ? `Grand cru ${plot.grandCru}` : plot.appellation ?? "—"}</Row>
        <Row label="Lieu-dit">{plot.lieuDit ?? "—"}</Row>
        <Row label="Commune">{plot.communeName ?? "—"}</Row>
        <Row label="Surface">{fmt(plot.areaHa, 2, " ha")}</Row>
        <Row label="Source">
          {plot.source === "rpg"
            ? `RPG (déclaration PAC)${plot.isOrganic ? " · bio" : ""}`
            : "BD TOPO (photo-interprétée, non déclarée PAC)"}
        </Row>
      </section>

      <section>
        <H3>Terrain</H3>
        <div className="space-y-1 rounded-lg border border-slate-200 p-2.5">
          <Row label="Sous-sol">
            <b>{rockFamilyLabel(plot.geolFamily)}</b>
            {plot.geolDescr && (
              <span className="block text-[11px] text-slate-500">
                {plot.geolNotation ? `${plot.geolNotation} — ` : ""}
                {plot.geolDescr}
              </span>
            )}
          </Row>
          <Row label="Sol dominant">{plot.soilName ?? "—"} <span className="text-slate-400">(1/250 000)</span></Row>
          <Row label="Altitude">{fmt(plot.altitudeM, 0, " m")}</Row>
          <Row label="Pente">{fmt(plot.slopePct, 1, " %")}</Row>
          <Row label="Exposition">
            {aspectLabel(plot.aspectDeg, plot.slopePct)}
            {plot.aspectDeg != null && plot.slopePct != null && plot.slopePct >= 2 ? ` (${fmt(plot.aspectDeg)}°)` : ""}
          </Row>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <H3>Score terroir</H3>
          <ModeToggle mode={mode} onChange={setMode} />
        </div>
        <div className="rounded-lg border border-slate-200 p-2.5">
          <div className="mb-2 flex items-center gap-2 text-sm">
            <ScorePill score={score} /> <span className="text-slate-500">/ 100</span>
          </div>
          {plot.scoreComponents && <ComponentBars c={plot.scoreComponents} mode={mode} />}
          <p className="mt-2 text-[10px] leading-snug text-slate-400">
            Indicatif : lecture homogène de critères publics (géologie 1/50 000, relief, sol
            1/250 000), pas un classement officiel. Pondération entre parenthèses.
          </p>
        </div>
      </section>

      <section>
        <H3>Domaine estimé</H3>
        {plot.domainId ? (
          <div className="rounded-lg border border-slate-200 p-2.5 text-xs text-slate-700">
            <button
              type="button"
              className="font-medium text-wine-700 hover:underline"
              onClick={() => domain && onSelectDomain(domain.id, domainSelection(domain))}
            >
              {plot.domainName ?? plot.domainId}
            </button>
            <p className="mt-1 text-[11px] text-slate-500">
              {plot.domainViaCru ? "Grand cru déclaré par le domaine" : "Parcelle la plus proche du chai encore libre"}
              {" · "}
              {fmt(plot.domainDistanceM != null ? plot.domainDistanceM / 1000 : null, 1, " km")} du chai.
              Estimation géographique, pas le casier viticole.
            </p>
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            Aucun domaine de référence attribué (la liste ne couvre qu&apos;une soixantaine de domaines).
          </p>
        )}
      </section>
    </>
  );
}

/** Card of one reference domain: declared data, estimated plots, score. */
export function DomainDetails({ domain: d }: { domain: WineDomain }) {
  const fams = Object.entries(d.terroir.familles ?? {});
  return (
    <>
      <section className="space-y-1 rounded-lg border border-slate-200 p-2.5">
        <Row label="Commune du chai">{d.commune ?? "—"}{d.coordPrecision === "commune" ? " (centre du village)" : ""}</Row>
        <Row label="Surface déclarée">{fmt(d.surfaceHa, 1, " ha")}</Row>
        {d.surfaceNote && <p className="text-[11px] text-slate-500">{d.surfaceNote}</p>}
        <Row label="Grands crus déclarés">{d.grandsCrus.length ? d.grandsCrus.join(", ") : "—"}</Row>
        {d.lieuxDits.length > 0 && <Row label="Lieux-dits / clos">{d.lieuxDits.join(", ")}</Row>}
        <Row label="Conduite">{d.certification ?? "—"}</Row>
      </section>

      <section>
        <H3>Score terroir estimé</H3>
        <div className="space-y-1.5 rounded-lg border border-slate-200 p-2.5">
          <Row label="Parcelles attribuées (soleil)"><ScorePill score={d.scoreSun} /></Row>
          <Row label="Parcelles attribuées (fraîcheur)"><ScorePill score={d.scoreCool} /></Row>
          <Row label="Secteur 1,5 km (soleil)"><ScorePill score={d.sectorScoreSun} /></Row>
          <Row label="Altitude / pente médianes">
            {fmt(d.terroir.altitude_med_m, 0, " m")} · {fmt(d.terroir.pente_med_pct, 1, " %")}
          </Row>
          {fams.length > 0 && (
            <Row label="Sous-sols">
              {fams.map(([k, share]) => `${rockFamilyLabel(k)} ${Math.round(share * 100)} %`).join(", ")}
            </Row>
          )}
          {(d.terroir.crus ?? []).length > 0 && <Row label="Grands crus couverts">{d.terroir.crus!.join(", ")}</Row>}
        </div>
      </section>

      <section>
        <H3>Attribution des parcelles</H3>
        <div className="space-y-1 rounded-lg border border-slate-200 p-2.5">
          <Row label="Surface attribuée">
            {fmt(d.assignedHa, 1, " ha")} · {d.coverage != null ? `${Math.round(d.coverage * 100)} %` : "—"} (cible 80 %)
          </Row>
          <Row label="Parcelles">{fmt(d.nPlots)}</Row>
          <Row label="Distance moyenne / max">
            {fmt(d.meanDistanceM != null ? d.meanDistanceM / 1000 : null, 1)} / {fmt(d.maxDistanceM != null ? d.maxDistanceM / 1000 : null, 1, " km")}
          </Row>
          <Row label="Rayon autorisé">{fmt(d.reachM != null ? d.reachM / 1000 : null, 1, " km")}</Row>
          <Row label="Part via grands crus">{d.shareInCrus != null ? `${Math.round(d.shareInCrus * 100)} %` : "—"}</Row>
          <Row label="Confiance">{d.assignmentConfidence ?? "—"}</Row>
          <p className="pt-1 text-[10px] leading-snug text-slate-400">
            Estimation : les grands crus déclarés d&apos;abord (plafonnés), puis les vignes libres les plus
            proches du chai, jusqu&apos;à 80 % de la surface déclarée, sans dépasser le rayon autorisé
            (qui croît avec la taille du domaine). Ce n&apos;est pas le casier viticole.
          </p>
        </div>
      </section>

      {d.sources.length > 0 && (
        <section>
          <H3>Sources ({d.sourceConfidence ?? "—"})</H3>
          <ul className="space-y-0.5 text-[11px]">
            {d.sources.map((s) => (
              <li key={s} className="truncate">
                <a href={s} target="_blank" rel="noreferrer" className="text-wine-700 hover:underline">
                  {s.replace(/^https?:\/\//, "")}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/** Sortable ranking of a region's reference domains. */
export function DomainRanking({
  regionId,
  onSelectDomain,
}: {
  regionId: string;
  onSelectDomain: (id: string, feature: SelectedGeoFeature) => void;
}) {
  const domains = useDomains(regionId);
  const [sortBy, setSortBy] = useState<"scoreSun" | "scoreCool" | "surfaceHa" | "coverage">("scoreSun");
  if (!domains.length) return null;
  const sorted = [...domains].sort((a, b) => (b[sortBy] ?? -1) - (a[sortBy] ?? -1));
  const head = (key: typeof sortBy, label: string) => (
    <th className="px-1 py-1 text-right font-medium">
      <button type="button" onClick={() => setSortBy(key)} className={sortBy === key ? "text-wine-700" : "hover:text-slate-700"}>
        {label}
      </button>
    </th>
  );
  return (
    <section>
      <H3>Domaines de référence ({domains.length})</H3>
      <p className="mb-2 text-[11px] text-slate-500">
        Score terroir moyen des parcelles estimées de chaque domaine. Cliquer pour voir ses parcelles.
      </p>
      <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-1.5 py-1 text-left font-medium">Domaine</th>
              {head("scoreSun", "Soleil")}
              {head("scoreCool", "Fraîch.")}
              {head("surfaceHa", "ha")}
              {head("coverage", "Couv.")}
            </tr>
          </thead>
          <tbody>
            {sorted.map((d) => (
              <tr
                key={d.id}
                onClick={() => onSelectDomain(d.id, domainSelection(d))}
                className="cursor-pointer border-t border-slate-100 hover:bg-wine-50"
              >
                <td className="px-1.5 py-1">
                  <div className="font-medium text-slate-800">{d.name}</div>
                  <div className="text-[10px] text-slate-400">{d.commune}</div>
                </td>
                <td className="px-1 text-right"><ScorePill score={d.scoreSun} /></td>
                <td className="px-1 text-right"><ScorePill score={d.scoreCool} /></td>
                <td className="px-1 text-right text-slate-600">{fmt(d.surfaceHa, 0)}</td>
                <td className="px-1 text-right text-slate-600">
                  {d.coverage != null ? `${Math.round(d.coverage * 100)} %` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
