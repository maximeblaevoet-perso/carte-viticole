/**
 * Place search for the map (ADR 0023).
 *
 * The index is a static file (`public/search-index.json`, built by
 * `scripts/build_search_index.py` from Supabase) loaded ONCE in the browser,
 * then searched in memory: no request per keystroke, results in < 5 ms.
 * Seed (synthetic) areas of the regions without real contours are added on top
 * so every region stays findable in the demo setup.
 *
 * Each hit carries its bounding box: the map frames the place it lands on
 * instead of easing to a fixed zoom around a point.
 */

import { WINE_AREAS, REGION_TYPE_LABELS } from "@/data/areas";
import { AREA_GEOMETRIES } from "@/data/geo";
import type {
  AreaLevel,
  GeoDataProvenance,
  RegionType,
  SelectedGeoFeature,
} from "@/lib/types";

/** [west, south, east, north] in WGS84. */
export type BBox = [number, number, number, number];

export type SearchKind = "area" | "lieu-dit" | "commune" | "domain" | "seed";

export interface SearchEntry {
  kind: SearchKind;
  id: string;
  name: string;
  /** `region`, `premier-cru`, `lieu-dit`, `commune`, `domaine` … */
  type: string;
  level: AreaLevel | null;
  rootRegionId: string | null;
  parentId: string | null;
  /** Secondary line: parent area or commune. */
  context: string | null;
  bbox: BBox;
  provenance: GeoDataProvenance | null;
  communeInsee: string | null;
  /** Normalised name, for matching. */
  norm: string;
  /** Lower = shown first on equal match quality. */
  rank: number;
}

export interface SearchIndex {
  entries: SearchEntry[];
  byId: Map<string, SearchEntry>;
}

/** Labels shown on the result chip (« de quoi s'agit-il »). */
export const SEARCH_TYPE_LABELS: Record<string, string> = {
  ...REGION_TYPE_LABELS,
  appellation: "Appellation",
  "lieu-dit": "Lieu-dit",
  commune: "Commune",
  domaine: "Domaine",
};

/** Tie-break order: big, well-known places before the long tail. */
const TYPE_RANK: Record<string, number> = {
  region: 0,
  subregion: 1,
  zone: 1,
  village: 2,
  appellation: 3,
  "grand-cru": 4,
  "premier-cru": 5,
  domaine: 6,
  commune: 7,
  "lieu-dit": 8,
  parcelle: 9,
};

/** Lowercase, no accents, punctuation → spaces, single spaces. */
export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Cadastre lieux-dits are UPPER CASE: show them as « Les Amoureuses ». */
export function displayName(name: string): string {
  if (name !== name.toUpperCase() || !/[A-Z]/.test(name)) return name;
  const small = new Set(["de", "des", "du", "la", "le", "les", "en", "aux", "au", "sur", "sous", "et", "a"]);
  return name
    .toLowerCase()
    .split(/(\s+|-|')/)
    .map((w, i) =>
      i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)
    )
    .join("");
}

type RawEntry = [
  string, // kind
  string, // id
  string, // name
  string, // regionType
  number | null, // level
  string | null, // rootRegionId
  string | null, // parentId
  string | null, // context
  BBox,
  number | null, // ds index
  string | null, // communeInsee
  number, // mapVisible
];
type RawDs = [string | null, string, boolean, boolean, string | null, string | null];

function bboxOfCoords(coords: unknown, acc: BBox): BBox {
  if (Array.isArray(coords) && typeof coords[0] === "number") {
    const [x, y] = coords as number[];
    return [Math.min(acc[0], x), Math.min(acc[1], y), Math.max(acc[2], x), Math.max(acc[3], y)];
  }
  if (Array.isArray(coords)) {
    for (const c of coords) acc = bboxOfCoords(c, acc);
  }
  return acc;
}

/** Seed areas: every region, plus the sub-areas of regions with no real data. */
function seedEntries(realIds: Set<string>, realRoots: Set<string>): SearchEntry[] {
  const out: SearchEntry[] = [];
  for (const a of WINE_AREAS) {
    if (realIds.has(a.id)) continue;
    if (a.level > 1 && realRoots.has(a.rootRegionId)) continue;
    const geom = a.geoJsonId ? AREA_GEOMETRIES[a.geoJsonId] : undefined;
    const bbox = geom
      ? bboxOfCoords(geom.coordinates, [180, 90, -180, -90])
      : ([a.center[0], a.center[1], a.center[0], a.center[1]] as BBox);
    const parent = a.parentId ? WINE_AREAS.find((p) => p.id === a.parentId) : undefined;
    out.push({
      kind: "seed",
      id: a.id,
      name: a.name,
      type: a.regionType,
      level: a.level,
      rootRegionId: a.rootRegionId,
      parentId: a.parentId,
      context: parent?.name ?? null,
      bbox,
      provenance: null,
      communeInsee: null,
      norm: normalize(a.name),
      rank: TYPE_RANK[a.regionType] ?? 9,
    });
  }
  return out;
}

let indexPromise: Promise<SearchIndex> | null = null;

/** Loads (once) and memoises the index. Never rejects: empty on failure. */
export function loadSearchIndex(): Promise<SearchIndex> {
  if (!indexPromise) {
    indexPromise = fetch("/search-index.json")
      .then((r) => (r.ok ? r.json() : { e: [], ds: [] }))
      .catch(() => ({ e: [], ds: [] }))
      .then((raw: { e?: RawEntry[]; ds?: RawDs[] }) => buildIndex(raw.e ?? [], raw.ds ?? []));
  }
  return indexPromise;
}

function buildIndex(rows: RawEntry[], ds: RawDs[]): SearchIndex {
  const provenance = ds.map(
    ([sourceDatasetId, sourceType, isOfficial, isInformative, license, attribution]) =>
      ({
        sourceDatasetId,
        sourceType: sourceType as GeoDataProvenance["sourceType"],
        isOfficial,
        isInformative,
        sourceUpdatedAt: null,
        license,
        attribution,
      }) satisfies GeoDataProvenance
  );

  const entries: SearchEntry[] = [];
  const realRoots = new Set<string>();
  for (const r of rows) {
    const [kind, id, name, type, level, root, parentId, context, bbox, dsIdx, insee, visible] = r;
    if (root) realRoots.add(root);
    entries.push({
      kind: kind as SearchKind,
      id,
      name: kind === "lieu-dit" ? displayName(name) : name,
      type,
      level: (level ?? null) as AreaLevel | null,
      rootRegionId: root,
      parentId,
      context,
      bbox,
      provenance: dsIdx == null ? null : provenance[dsIdx] ?? null,
      communeInsee: insee,
      norm: normalize(name),
      // Hidden regional appellations (e.g. « Bourgogne aligoté ») after the rest.
      rank: (TYPE_RANK[type] ?? 9) + (visible ? 0 : 0.5),
    });
  }
  const realIds = new Set(entries.map((e) => e.id));
  entries.push(...seedEntries(realIds, realRoots));

  return { entries, byId: new Map(entries.map((e) => [e.id, e])) };
}

/**
 * Best matches for `query`: whole-name prefix, then word prefix, then
 * substring; every query word must match. Ties: bigger places first, shorter
 * names first.
 */
export function searchPlaces(index: SearchIndex, query: string, limit = 8): SearchEntry[] {
  const q = normalize(query);
  if (q.length < 2) return [];
  const words = q.split(" ");
  const scored: { e: SearchEntry; s: number }[] = [];

  for (const e of index.entries) {
    const n = e.norm;
    let s: number;
    if (n === q) s = 0;
    else if (n.startsWith(q)) s = 1;
    else if ((" " + n).includes(" " + q)) s = 2;
    else if (words.length > 1 && words.every((w) => (" " + n).includes(" " + w))) s = 3;
    else if (n.includes(q)) s = 4;
    else continue;
    scored.push({ e, s: s * 100 + e.rank * 10 + Math.min(n.length, 60) / 10 });
  }
  scored.sort((a, b) => a.s - b.s);

  // Same name + same context (a lieu-dit split per section) → keep one.
  const seen = new Set<string>();
  const out: SearchEntry[] = [];
  for (const { e } of scored) {
    const key = `${e.type}|${e.norm}|${e.context ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
    if (out.length >= limit) break;
  }
  return out;
}

/** Selection the panel understands, for a real area / lieu-dit hit. */
export function selectionFor(e: SearchEntry, index: SearchIndex): SelectedGeoFeature | null {
  const provenance: GeoDataProvenance = e.provenance ?? {
    sourceDatasetId: null,
    sourceType: "real",
    isOfficial: false,
    isInformative: true,
    sourceUpdatedAt: null,
    license: null,
    attribution: null,
  };
  if (e.kind === "area") {
    return {
      kind: "area",
      id: e.id,
      name: e.name,
      level: e.level ?? undefined,
      regionType: e.type as RegionType,
      rootRegionId: e.rootRegionId ?? undefined,
      parentId: e.parentId,
      provenance,
    };
  }
  if (e.kind === "lieu-dit") {
    const parent = e.parentId ? index.byId.get(e.parentId) : undefined;
    return {
      kind: "lieu-dit",
      id: e.id,
      name: e.name,
      communeInsee: e.communeInsee,
      parentId: e.parentId,
      areaName: parent?.name ?? null,
      areaRegionType: parent?.type ?? null,
      rootRegionId: e.rootRegionId ?? undefined,
      provenance,
    };
  }
  return null;
}

/**
 * Zoom bounds when framing a place: never so far in that the context is lost,
 * never so far out that the layer that draws it is not shown yet (crus ship
 * from z10, lieux-dits from z13 — migration 0018).
 */
export function zoomRangeFor(type: string, level: AreaLevel | null): [number, number] {
  if (type === "lieu-dit") return [13.2, 16];
  if (type === "commune") return [11, 14];
  if (type === "domaine") return [12.5, 14];
  if (type === "grand-cru" || type === "premier-cru") return [10.5, 15.5];
  switch (level) {
    case 1:
      return [5, 9];
    case 2:
      return [7, 11];
    case 3:
      return [8, 13.5];
    default:
      return [9, 15];
  }
}
