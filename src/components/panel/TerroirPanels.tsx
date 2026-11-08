"use client";

import { useState } from "react";
import { useDomains } from "@/hooks/useDomains";
import {
  CRITERIA,
  CRU_LEVEL_LABELS,
  SCORE_MODE_LABELS,
  aspectLabel,
  componentValue,
  cruLabel,
  gridFor,
  domainSelection,
  domainsDeclaringPlot,
  rockFamilyLabel,
  scoreColor,
} from "@/lib/terroir-score";
import type {
  DomainPlace,
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

function ComponentBars({ c, mode, regionId }: { c: ScoreComponents; mode: ScoreMode; regionId: string }) {
  const weights = gridFor(regionId).poids;
  return (
    <div className="space-y-1">
      {CRITERIA.map(({ key, label }) => {
        const v = componentValue(c, key, mode);
        return (
          <div key={key} className="flex items-center gap-2 text-[11px]">
            <span className="w-20 shrink-0 text-slate-500">
              {label} <span className="text-slate-400">({weights[key]})</span>
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

/** Card of one planted vine plot: place, terrain, score, domains declaring its place. */
export function VinePlotDetails({
  plot,
  onSelectDomain,
}: {
  plot: VinePlot;
  onSelectDomain: (id: string, feature: SelectedGeoFeature) => void;
}) {
  const [mode, setMode] = useState<ScoreMode>(gridFor(plot.rootRegionId).mode_defaut as ScoreMode);
  const domains = useDomains(plot.rootRegionId);
  const claims = domainsDeclaringPlot(domains, plot);
  const score = mode === "soleil" ? plot.scoreSun : plot.scoreCool;

  return (
    <>
      <section className="space-y-1 rounded-lg border border-slate-200 p-2.5">
        <Row label="Appellation">{cruLabel(plot)}</Row>
        {plot.cruLevel && <Row label="Niveau">{CRU_LEVEL_LABELS[plot.cruLevel]}</Row>}
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
            {aspectLabel(plot.aspectDeg, plot.slopePct, plot.rootRegionId)}
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
          {plot.scoreComponents && <ComponentBars c={plot.scoreComponents} mode={mode} regionId={plot.rootRegionId} />}
          <p className="mt-2 text-[10px] leading-snug text-slate-400">
            Indicatif : lecture homogène de critères publics (géologie 1/50 000, relief, sol
            1/250 000), pas un classement officiel. Pondération entre parenthèses.
          </p>
        </div>
      </section>

      <section>
        <H3>Domaines de référence</H3>
        {claims.length ? (
          <ul className="space-y-1 rounded-lg border border-slate-200 p-2.5 text-xs text-slate-700">
            {claims.map(({ domain, place }) => (
              <li key={domain.id}>
                <button
                  type="button"
                  className="font-medium text-wine-700 hover:underline"
                  onClick={() => onSelectDomain(domain.id, domainSelection(domain))}
                >
                  {domain.name}
                </button>{" "}
                <span className="text-slate-500">déclare {place.name}</span>
              </li>
            ))}
            <li className="pt-1 text-[10px] leading-snug text-slate-400">
              Le domaine déclare ce lieu ; rien ne dit que cette parcelle-ci est la sienne.
            </li>
          </ul>
        ) : (
          <p className="text-xs text-slate-500">
            Aucun domaine de la liste ne déclare ce cru, ce village ou ce lieu-dit.
          </p>
        )}
      </section>
    </>
  );
}

const PLACE_COLORS: Record<DomainPlace["kind"], string> = {
  grand_cru: "#be185d",
  premier_cru: "#db2777",
  village: "#f9a8d4",
  lieu_dit: "#f472b6",
  reste: "#cbd5e1",
};

const BASIS_LABELS: Record<NonNullable<DomainPlace["basis"]>, string> = {
  declaree: "surface déclarée",
  repartie: "part du total déclaré en grands crus",
  defaut: "surface inconnue : valeur par défaut",
  reste: "moyenne des vignes village et régionales des communes",
};

/** Card of one reference domain: declared data, composed score, sources. */
export function DomainDetails({ domain: d }: { domain: WineDomain }) {
  const [mode, setMode] = useState<ScoreMode>(gridFor(d.rootRegionId).mode_defaut as ScoreMode);
  const fams = Object.entries(d.terroir.familles ?? {});
  const total = d.composition.reduce((t, p) => t + (p.areaHa ?? 0), 0);
  const score = (x: { scoreSun: number | null; scoreCool: number | null }) =>
    mode === "soleil" ? x.scoreSun : x.scoreCool;
  return (
    <>
      <section className="space-y-1 rounded-lg border border-slate-200 p-2.5">
        <Row label="Commune du chai">{d.commune ?? "—"}{d.coordPrecision === "commune" ? " (centre du village)" : ""}</Row>
        <Row label="Surface déclarée">{fmt(d.surfaceHa, 1, " ha")}</Row>
        {d.surfaceNote && <p className="text-[11px] text-slate-500">{d.surfaceNote}</p>}
        <Row label="Communes des vignes">{d.communes.length ? d.communes.join(", ") : "—"}</Row>
        <Row label="Conduite">{d.certification ?? "—"}</Row>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <H3>Score terroir estimé</H3>
          <ModeToggle mode={mode} onChange={setMode} />
        </div>
        <div className="space-y-2 rounded-lg border border-slate-200 p-2.5">
          <div className="flex items-center gap-2 text-sm">
            <ScorePill score={score(d)} /> <span className="text-slate-500">/ 100</span>
            <span className="ml-auto text-[11px] text-slate-500">
              secteur 1,5 km <ScorePill score={mode === "soleil" ? d.sectorScoreSun : d.sectorScoreCool} />
            </span>
          </div>
          {total > 0 && (
            <div className="flex h-2 overflow-hidden rounded">
              {d.composition.map((p) => (
                <div
                  key={p.name}
                  title={p.name}
                  style={{ width: `${((p.areaHa ?? 0) / total) * 100}%`, background: PLACE_COLORS[p.kind] }}
                  className="border-r border-white last:border-r-0"
                />
              ))}
            </div>
          )}
          <ul className="space-y-1">
            {d.composition.map((p) => (
              <li key={p.name} className="flex items-start gap-2 text-xs">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-sm" style={{ background: PLACE_COLORS[p.kind] }} />
                <span className="min-w-0 flex-1">
                  <span className="text-slate-800">
                    {p.kind === "reste" ? `Reste · ${(p.communes ?? []).join(", ")}` : p.name}
                  </span>
                  <span className="block text-[10px] text-slate-400">
                    {p.areaHa != null ? `≈ ${fmt(p.areaHa, 1, " ha")} · ` : ""}
                    {p.basis ? BASIS_LABELS[p.basis] : "surface du domaine inconnue"}
                    {p.kind !== "reste" && p.distanceM != null ? ` · ${fmt(p.distanceM / 1000, 1, " km")} du chai` : ""}
                  </span>
                </span>
                <ScorePill score={score(p)} />
              </li>
            ))}
          </ul>
          {d.unresolvedPlaces.length > 0 && (
            <p className="text-[11px] text-slate-500">
              Non localisés (comptés dans le reste) : {d.unresolvedPlaces.join(", ")}
            </p>
          )}
          <Row label="Confiance">{d.scoreConfidence ?? "—"}</Row>
          <Row label="Altitude / pente médianes">
            {fmt(d.terroir.altitude_med_m, 0, " m")} · {fmt(d.terroir.pente_med_pct, 1, " %")}
          </Row>
          {fams.length > 0 && (
            <Row label="Sous-sols">
              {fams.map(([k, share]) => `${rockFamilyLabel(k)} ${Math.round(share * 100)} %`).join(", ")}
            </Row>
          )}
          <p className="pt-1 text-[10px] leading-snug text-slate-400">
            Estimation : chaque cru, village ou lieu-dit déclaré compte pour sa surface déclarée (sinon 25 % du
            lieu, au plus 12 % du domaine) ; le reste de la surface prend la moyenne des vignes village et
            régionales de ses communes. Aucune parcelle n&apos;est attribuée : le casier viticole n&apos;est pas public.
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
  const [sortBy, setSortBy] = useState<"scoreSun" | "scoreCool" | "surfaceHa">("scoreSun");
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
        Score terroir estimé à partir des grands crus et lieux-dits déclarés et des communes de chaque
        domaine. Cliquer pour voir ses lieux sur la carte.
      </p>
      <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-1.5 py-1 text-left font-medium">Domaine</th>
              {head("scoreSun", "Soleil")}
              {head("scoreCool", "Fraîch.")}
              {head("surfaceHa", "ha")}
              <th className="px-1 py-1 text-right font-medium">Conf.</th>
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
                <td className="px-1 text-right text-slate-600">{d.scoreConfidence ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
