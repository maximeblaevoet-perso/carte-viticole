/**
 * Terroir score of a planted vine plot — display side (ADR 0016).
 *
 * The score is computed offline by `scripts/terroir_score.py` from the grid of
 * the plot's region (`src/data/terroir-score-<region>.json`), and stored per
 * plot with its five components in [0, 1]. This module only re-weights stored
 * components and labels them: the step tables and family values are never
 * duplicated here.
 */
import grid from "@/data/terroir-score-alsace.json";
import gridBourgogne from "@/data/terroir-score-bourgogne.json";
import type {
  CruLevel,
  DomainPlace,
  ScoreComponents,
  ScoreMode,
  SelectedGeoFeature,
  VinePlot,
  WineDomain,
} from "@/lib/types";

/** Alsace grid: the default, and the reference for the criteria keys. */
export const SCORE_GRID = grid;

export type Criterion = keyof typeof grid.poids;

export interface ScoreGridView {
  version: string;
  mode_defaut: string;
  poids: Record<Criterion, number>;
  exposition: { plat_pente_max: number };
}

const GRIDS: Record<string, ScoreGridView> = {
  alsace: grid,
  bourgogne: gridBourgogne,
};

/** Score grid of a region (ADR 0021); the Alsace grid when it has none. */
export function gridFor(regionId: string | null | undefined): ScoreGridView {
  return (regionId && GRIDS[regionId]) || grid;
}

export const CRU_LEVEL_LABELS: Record<CruLevel, string> = {
  grand_cru: "Grand cru",
  premier_cru: "Premier cru",
  village: "Village / communale",
  regional: "Régionale",
};

/** Readable appellation of a plot: "Grand cru Chambertin", "Meursault 1er cru Les Perrières"… */
export function cruLabel(v: VinePlot): string {
  if (v.grandCru) return `Grand cru ${v.grandCru}`;
  if (v.cruLevel === "premier_cru") {
    return v.premierCru ? `${v.village ?? ""} 1er cru ${v.premierCru}`.trim() : v.appellation ?? "Premier cru";
  }
  return v.appellation ?? "—";
}

export const CRITERIA: { key: Criterion; label: string }[] = [
  { key: "geologie", label: "Géologie" },
  { key: "exposition", label: "Exposition" },
  { key: "pente", label: "Pente" },
  { key: "altitude", label: "Altitude" },
  { key: "sol", label: "Sol (RRP)" },
];

export const SCORE_MODE_LABELS: Record<ScoreMode, string> = {
  soleil: "Lecture soleil",
  fraicheur: "Lecture fraîcheur",
};

/** One component of a plot under a given exposition reading. */
export function componentValue(
  c: ScoreComponents,
  key: Criterion,
  mode: ScoreMode
): number {
  if (key === "exposition") {
    return mode === "soleil" ? c.exposition_soleil : c.exposition_fraicheur;
  }
  return c[key];
}

/** Weighted score 0-100 — same formula as `terroir_score.weighted`. */
export function weightedScore(
  c: ScoreComponents,
  mode: ScoreMode,
  weights: Record<Criterion, number> = grid.poids
): number {
  let total = 0;
  let sum = 0;
  for (const { key } of CRITERIA) {
    total += weights[key];
    sum += weights[key] * componentValue(c, key, mode);
  }
  return total ? Math.round((1000 * sum) / total) / 10 : 0;
}

const SECTORS = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"] as const;

/** Aspect sector, or "plat" under the grid's flat-slope threshold. */
export function aspectLabel(
  aspectDeg: number | null,
  slopePct: number | null,
  regionId?: string | null
): string {
  if (aspectDeg == null || slopePct == null) return "—";
  if (slopePct < gridFor(regionId).exposition.plat_pente_max) return "plat";
  return SECTORS[Math.floor((((aspectDeg % 360) + 360) % 360 + 22.5) / 45) % 8];
}

/** Grid key → plain French label (keys from `terroir_score.FAMILIES`). */
export const ROCK_FAMILY_LABELS: Record<string, string> = {
  eboulis: "Éboulis de pente",
  solifluxion: "Dépôts soliflués",
  colluvions: "Colluvions",
  alluvions: "Alluvions",
  loess: "Lœss et lehms",
  cailloutis: "Cailloutis de piémont",
  limons: "Limons",
  eau: "Eau libre",
  glaciaire: "Dépôts glaciaires",
  tourbe: "Tourbe",
  remblais: "Remblais",
  travertin: "Travertin",
  craie: "Craie",
  calcaire: "Calcaire",
  marne: "Marne",
  marnes_gypse: "Marnes à gypse",
  conglomerat: "Conglomérat",
  gres: "Grès",
  argile: "Argile",
  sable: "Sable",
  volcanique: "Roches volcaniques",
  granite: "Granite",
  magmatique: "Roche magmatique",
  gneiss: "Gneiss",
  micaschiste: "Micaschiste",
  schiste: "Schiste",
  grauwacke: "Grauwacke",
  gaize: "Gaize",
  breche: "Brèche",
  quartzite: "Quartzite",
  metamorphique_basique: "Roche métamorphique basique",
  autre: "Autre / non classé",
};

export function rockFamilyLabel(key: string | null | undefined): string {
  return (key && ROCK_FAMILY_LABELS[key]) || "—";
}

/** Score colour ramp (red → blue), shared by the map and the panel. */
export const SCORE_RAMP: [number, string][] = [
  [40, "#b2182b"],
  [55, "#ef8a62"],
  [65, "#fddbc7"],
  [72, "#d1e5f0"],
  [80, "#67a9cf"],
  [90, "#2166ac"],
];

export function scoreColor(score: number | null | undefined): string {
  if (score == null) return "#9ca3af";
  let color = SCORE_RAMP[0][1];
  for (const [at, c] of SCORE_RAMP) if (score >= at) color = c;
  return color;
}

/** Panel / map selection payload for a reference domain. */
export function domainSelection(d: WineDomain): SelectedGeoFeature {
  return {
    kind: "domain",
    id: d.id,
    name: d.name,
    rootRegionId: d.rootRegionId,
    communeInsee: d.communeInsee,
    areaHa: d.surfaceHa,
    domain: d,
    provenance: {
      sourceDatasetId: `manual-${d.rootRegionId}-domains`,
      sourceType: d.sourceType,
      isOfficial: false,
      isInformative: true,
      sourceUpdatedAt: null,
      license: null,
      attribution: "Compilation manuelle — voir les sources du domaine",
    },
  };
}

/** Parse the `score_components` MVT property (JSON text). */
export function parseComponents(raw: unknown): ScoreComponents | null {
  if (raw && typeof raw === "object") return raw as ScoreComponents;
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as ScoreComponents;
  } catch {
    return null;
  }
}

const foldName = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * Domains that declare the grand cru, premier cru, village appellation or
 * lieu-dit a vine plot lies in (ADR 0019, 0021).
 * A place pinned to cadastral lieux-dits (Clos Saint-Urbain in the Rangen)
 * matches only there. Never says the plot belongs to the domain.
 */
export function domainsDeclaringPlot(
  domains: WineDomain[],
  plot: VinePlot
): { domain: WineDomain; place: DomainPlace }[] {
  const out: { domain: WineDomain; place: DomainPlace }[] = [];
  for (const domain of domains) {
    const place = domain.composition.find((p) => {
      if (p.kind === "reste") return false;
      if (p.lieux) {
        return p.lieux.some(
          (l) => l.lieu_dit === plot.lieuDit && foldName(l.commune) === foldName(plot.communeName ?? "")
        );
      }
      if (p.premierCru) return !!plot.appellation && foldName(p.premierCru) === foldName(plot.appellation);
      if (p.village) {
        return plot.cruLevel === "village" && !!plot.village && foldName(p.village) === foldName(plot.village);
      }
      if (!p.grandCru || !plot.grandCru) return false;
      const cru = foldName(p.grandCru);
      return cru === foldName(plot.grandCru) || cru === foldName(plot.appellation ?? "");
    });
    if (place) out.push({ domain, place });
  }
  return out;
}
