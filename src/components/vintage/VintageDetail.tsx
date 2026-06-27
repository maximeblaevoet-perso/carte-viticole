"use client";

import Link from "next/link";
import { useState } from "react";
import { INDICATOR_META } from "@/lib/indicators";
import { fmtWithUnit } from "@/lib/format";
import type {
  RegionSoil,
  RegionVintageClimate,
  VintageScore,
  WineRegion,
} from "@/lib/types";
import { FlagChips } from "@/components/FlagChips";
import { KeyIndicators } from "@/components/KeyIndicators";
import { SourceBadge } from "@/components/SourceBadge";
import { MonthlyClimateChart } from "@/components/charts/MonthlyClimateChart";

const TABS = ["Climat", "Sols", "Notes", "Sources", "Methodologie"] as const;
type Tab = (typeof TABS)[number];

export function VintageDetail({
  region,
  vintage,
  soils,
  scores,
}: {
  region: WineRegion;
  vintage: RegionVintageClimate;
  soils: RegionSoil[];
  scores: VintageScore[];
}) {
  const [tab, setTab] = useState<Tab>("Climat");

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <Link
        href="/"
        className="text-sm text-wine-700 hover:underline"
      >
        &larr; Retour a la carte
      </Link>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {region.name} {vintage.year}
          </h1>
          <p className="text-sm text-slate-500">{region.macroArea}</p>
        </div>
        <div className="flex items-center gap-2">
          <SourceBadge
            sourceType={vintage.sourceType}
            confidence={vintage.confidence}
          />
          <Link
            href={`/compare?region=${region.id}&a=${vintage.year}`}
            className="rounded-md border border-wine-600 px-3 py-1.5 text-sm font-medium text-wine-700 hover:bg-wine-50"
          >
            Comparer
          </Link>
        </div>
      </div>

      <section className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Resume automatique
        </h2>
        <p className="mt-1 text-slate-700">{vintage.summary}</p>
        <div className="mt-3">
          <FlagChips flags={vintage.flags} />
        </div>
      </section>

      <nav className="mt-6 flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t
                ? "border-wine-600 text-wine-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t}
          </button>
        ))}
      </nav>

      <div className="py-5">
        {tab === "Climat" && (
          <div className="space-y-6">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-700">
                Indicateurs cles
              </h3>
              <KeyIndicators
                indicators={vintage.indicators}
                keys={INDICATOR_META.map((m) => m.key)}
              />
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-700">
                Temperature & pluie (mensuel)
              </h3>
              <MonthlyClimateChart monthly={vintage.monthly} height={320} />
              <p className="mt-1 text-xs text-slate-400">
                Affichage mensuel par defaut. Les indicateurs sont calcules a
                partir de donnees quotidiennes.
              </p>
            </div>
          </div>
        )}

        {tab === "Sols" && (
          <div className="space-y-3">
            {soils.length === 0 && (
              <p className="text-sm text-slate-500">Aucune donnee de sol.</p>
            )}
            {soils.map((s) => (
              <div
                key={s.soilType}
                className="rounded-lg border border-slate-200 p-3"
              >
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-slate-800">{s.soilType}</h4>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-500">
                      {s.sharePercent}%
                    </span>
                    <SourceBadge sourceType={s.sourceType} />
                  </div>
                </div>
                <p className="mt-1 text-sm text-slate-600">{s.description}</p>
              </div>
            ))}
          </div>
        )}

        {tab === "Notes" && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              Table generique <code>vintage_scores</code>. Aucune source
              protegee n&apos;est integree en V1.
            </p>
            {scores.length === 0 ? (
              <p className="text-sm text-slate-400">
                Aucune note disponible pour ce millesime.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-1.5">Source</th>
                    <th>Note</th>
                    <th>Echelle</th>
                    <th>Provenance</th>
                  </tr>
                </thead>
                <tbody>
                  {scores.map((sc, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="py-1.5">{sc.sourceName}</td>
                      <td>{sc.scoreValue ?? "—"}</td>
                      <td>{sc.scoreScale}</td>
                      <td>
                        <SourceBadge sourceType={sc.sourceType} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === "Sources" && (
          <div className="space-y-2 text-sm text-slate-600">
            <p>
              <strong>Donnees climatiques :</strong>{" "}
              <SourceBadge
                sourceType={vintage.sourceType}
                confidence={vintage.confidence}
              />
            </p>
            <p>
              En V1, les series climatiques sont <em>synthetiques</em> et
              deterministes. Elles seront remplacees par des donnees
              Meteo-France reelles via le pipeline d&apos;import.
            </p>
            <p>
              Aucune donnee issue d&apos;une source protegee (ex. Parker)
              n&apos;est utilisee ou scrapee.
            </p>
          </div>
        )}

        {tab === "Methodologie" && (
          <div className="space-y-2 text-sm text-slate-600">
            <p>
              Granularite source : <strong>quotidienne</strong>. Les graphiques
              par defaut sont <strong>mensuels</strong>.
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Saison de croissance : avril a septembre (temperatures), avril a octobre (GDD, jours chauds).</li>
              <li>GDD : somme de max(0, Tmoy − 10 °C).</li>
              <li>Gel de printemps : jours avec Tmin &lt; 0 °C en avril-mai.</li>
              <li>Indices composites (stress hydrique, risque vendanges) : 0-100, synthetiques.</li>
            </ul>
            <p>
              Details complets dans <code>docs/climate-methodology.md</code>.
            </p>
          </div>
        )}
      </div>

      <details className="mt-2 rounded-lg border border-slate-200 p-3">
        <summary className="cursor-pointer text-sm font-medium text-slate-600">
          Toutes les valeurs d&apos;indicateurs
        </summary>
        <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {INDICATOR_META.map((m) => (
            <div key={m.key} className="rounded border border-slate-100 p-2">
              <dt className="text-[11px] text-slate-500">{m.label}</dt>
              <dd className="text-sm font-medium text-slate-800">
                {fmtWithUnit(vintage.indicators[m.key], m.unit, m.decimals)}
              </dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}
