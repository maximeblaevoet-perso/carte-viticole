/**
 * Screen-share reveal (ADR 0025): a place hands over to its children when it
 * fills ~60 % of the short side of the screen, whatever its region.
 *
 * The tiles carry, per feature (migration 0020):
 *   - `reveal_zoom`         R: zoom at which THIS place fills 60 % of a
 *                              1024 px short side → its children take over;
 *   - `parent_reveal_zoom`  P: same for its parent → it starts being read.
 * Vines carry the `reveal_zoom` of their local context (commune vineyard or
 * village appellation).
 *
 * Both are shifted by log2(short side / 1024) for the actual screen, so a
 * phone reveals earlier than a wide desktop, at the same screen share.
 *
 * Reading of one place, in map zoom:
 *
 *   S = max(P − 1, R − 3.5)   drawn + named: the parent is ~30 % of the screen
 *                             and the place itself at least ~5 % of it
 *   R                         hands over: fill → faint wash, name → along edge,
 *                             outline → neutral parent edge
 *   R + 2                     the place is 4× the screen: outline and edge
 *                             name are gone, its children carry the reading
 *
 * MapLibre only accepts `["zoom"]` as the input of a top-level interpolate,
 * so the per-feature thresholds are written into every stop of a zoom grid.
 * Composite expressions are evaluated at whole zooms and blended in between:
 * fades last about one zoom level.
 */
import type maplibregl from "maplibre-gl";
import type { Map as MlMap } from "maplibre-gl";

type Expr = maplibregl.ExpressionSpecification;
const e = (x: unknown) => x as Expr;

/** Reference short side (px) the SQL `reveal_zoom` is computed for. */
export const REVEAL_REF_PX = 1024;

/** Gaps of the reading, in zoom levels (see module doc). */
export const REVEAL = {
  /** Children start once the parent spans ~30 % (2^-1 × 60 %). */
  afterParent: -1,
  /** …and once the place spans ≥ ~5 % of the screen (2^-3.5 × 60 %). */
  minShare: -3.5,
  /** Parent outline and edge name kept until the place is 4× the screen. */
  edgeKept: 2,
} as const;

/** Fallbacks before migration 0020 (≈ the former global bands, ADR 0022). */
const DEFAULT_R: Record<number, number> = { 1: 7.5, 2: 10.3, 3: 12.8, 4: 14, 5: 14 };
const DEFAULT_P: Record<number, number> = { 1: 0, 2: 7.5, 3: 10.3, 4: 11.5, 5: 11.5 };
/** Vines were shown from z13 before (ADR 0016). */
export const DEFAULT_VINE_REVEAL = 13;

/** Zoom offset for this screen: a small screen is filled at a lower zoom. */
export function revealOffset(map: MlMap): number {
  const el = map.getContainer();
  const side = Math.min(el.clientWidth, el.clientHeight);
  if (!side) return 0;
  return Math.max(-1.25, Math.min(0.25, Math.log2(side / REVEAL_REF_PX)));
}

const level = e(["to-number", ["coalesce", ["get", "level"], 3], 3]);
const byLevel = (table: Record<number, number>) =>
  e(["match", level, ...Object.entries(table).flatMap(([k, v]) => [Number(k), v]), 12]);

/** Numeric property; `to-number` alone turns a missing value into 0. */
const numOr = (prop: string, fallback: Expr | number) =>
  e(["to-number", ["coalesce", ["get", prop], fallback], fallback]);

/** R, shifted for the screen. */
export const revealZ = (off: number, fallback: Expr | number = byLevel(DEFAULT_R)) =>
  e(["+", numOr("reveal_zoom", fallback), off]);
/** P, shifted for the screen. */
const parentZ = (off: number) => e(["+", numOr("parent_reveal_zoom", byLevel(DEFAULT_P)), off]);
/** S: zoom at which the place is drawn and named. */
export const startZ = (off: number) =>
  e([
    "max",
    ["+", parentZ(off), REVEAL.afterParent],
    ["+", revealZ(off), REVEAL.minShare],
  ]);

/** Zoom grid the per-feature thresholds are evaluated on. */
const GRID: number[] = [];
for (let z = 4; z <= 18; z += 0.5) GRID.push(z);

/** Piecewise-linear ramp of `input` through `[x, y]` stops (clamped). */
export const ramp = (input: unknown, stops: [number, number][]) =>
  e(["interpolate", ["linear"], input, ...stops.flat()]);

/** `zoom − anchor` at a fixed grid zoom. */
export const since = (z: number, anchor: Expr) => e(["-", z, anchor]);

/** Zoom-interpolated expression whose stop values are per-feature. */
export function perZoom(f: (z: number) => unknown): Expr {
  return e(["interpolate", ["linear"], ["zoom"], ...GRID.flatMap((z) => [z, f(z)])]);
}

/** Hover / selection on top of a revealed opacity (an unrevealed place stays hidden, unless selected). */
export function withState(v: Expr, hoverBoost: number, selectedMin: number): Expr {
  return e([
    "case",
    ["boolean", ["feature-state", "selected"], false], ["max", v, selectedMin],
    ["boolean", ["feature-state", "hover"], false],
    ["case", [">", v, 0.01], ["min", ["+", v, hoverBoost], 0.75], v],
    v,
  ]);
}

/* -------------------------------------------------------------------------- */
/* Registry: expressions are rebuilt when the screen size changes the offset. */
/* -------------------------------------------------------------------------- */

interface Entry {
  id: string;
  prop: string;
  layout: boolean;
  build: (off: number) => unknown;
}
const ENTRIES: Entry[] = [];
let currentOff = 0;

/** Current offset (set by {@link applyRevealOffset}). */
export const revealOff = () => currentOff;

/**
 * A screen-dependent paint / layout value. Returns the value for the current
 * offset (to put in `addLayer`) and records how to rebuild it.
 */
export function revealed(id: string, prop: string, build: (off: number) => unknown, layout = false) {
  ENTRIES.push({ id, prop, layout, build });
  return build(currentOff) as never;
}

/** Recompute the screen offset; re-apply the expressions if it moved. */
export function applyRevealOffset(map: MlMap, force = false) {
  const off = Math.round(revealOffset(map) * 20) / 20;
  if (!force && Math.abs(off - currentOff) < 0.1) return;
  currentOff = off;
  for (const x of ENTRIES) {
    if (!map.getLayer(x.id)) continue;
    if (x.layout) map.setLayoutProperty(x.id, x.prop, x.build(off) as never);
    else map.setPaintProperty(x.id, x.prop, x.build(off) as never);
  }
}

/** Set the offset before the layers are built (no layer to update yet). */
export function initRevealOffset(map: MlMap) {
  currentOff = Math.round(revealOffset(map) * 20) / 20;
}

/* -------------------------------------------------------------------------- */
/* Same rule in JS, so an unrevealed (transparent) feature never takes hover. */
/* -------------------------------------------------------------------------- */

function n(v: unknown, fallback: number): number {
  const x = Number(v);
  return v === null || v === undefined || v === "" || !Number.isFinite(x) ? fallback : x;
}

export type RevealKind = "area" | "cru" | "vine";

/** Is this feature drawn at `zoom`? Mirrors the opacity expressions. */
export function isRevealed(kind: RevealKind, p: Record<string, unknown>, zoom: number): boolean {
  const off = currentOff;
  if (kind === "vine") return zoom >= n(p.reveal_zoom, DEFAULT_VINE_REVEAL) + off - 0.4;
  const lvl = n(p.level, 3);
  const R = n(p.reveal_zoom, DEFAULT_R[lvl] ?? 12) + off;
  const P = n(p.parent_reveal_zoom, DEFAULT_P[lvl] ?? 10) + off;
  const S = Math.max(P + REVEAL.afterParent, R + REVEAL.minShare);
  if (zoom < S - 0.4) return false;
  // A secteur / village wash is gone 1.5 zoom after hand-over; a cru stays.
  return kind === "cru" || zoom <= R + 1.5;
}
