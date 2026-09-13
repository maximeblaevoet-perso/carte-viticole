# ADR 0010 — Map visibility + progressive zoom for wine areas

## Status

Accepted — 2026-07-28

## Context

Real PostGIS wine areas are served as MVT (`wine_mvt`, ADR 0007). Two
readability problems showed up first on Alsace:

1. **INAO aires-geo is a product catalogue, not a map hierarchy.** It includes
   Crémant d’Alsace and a second AOC named “Alsace” whose polygons cover ~99%
   of the same regional footprint as L1 Alsace. It also repeats the generic
   “Alsace grand cru” envelope under each of the 51 named crus (identical
   geometry hash).
2. **Progressive zoom was incomplete on the real path.** Synthetic layers used
   `LEVEL_ZOOM` min/max. Real MapLibre layers had `minzoom` only, and
   `wine_mvt` ignored per-row `zoom_min` / `zoom_max`, so appellations never
   faded when crus appeared.

## Decision

1. Add `wine_areas.map_visible` (boolean, default true). Hidden areas stay in
   the hierarchy (panel, climate inheritance, provenance) but are omitted from
   MVT tiles.
2. Rewrite `wine_mvt` to filter `map_visible`, honour `zoom_min` / `zoom_max`,
   and hard-gate appellation tiles to `z < 11` (aligned with `LEVEL_ZOOM` L2
   max 10.5). MapLibre real layers get matching `maxzoom`.
3. Ingest heuristics for Alsace (`scripts/ingest_wine_geodata.py`):
   - hide region-footprint duplicates (denom = “Alsace”) and product AOCs
     matching `cremant`;
   - promote those footprints onto L1 / L2 editorial nodes when useful;
   - hide generic “Alsace grand cru” L4 and any GC whose aire-geo geom is an
     exact clone of that envelope;
   - **replace** named GC geoms with the dissolved union of linked
     `inao-parcellaire` parcels (the only source of distinct cru shapes).

## Consequences

- Alsace map layers become: L1 Alsace → L2/L3 sous-appellations (Côtes de Barr,
  …) → distinct GCs from parcellaire → parcels / lieux-dits at high zoom.
- Crémant and duplicate AOC “Alsace” remain queryable but do not paint.
- Re-ingest with the updated script is idempotent with these rules.
- Other regions can reuse `map_visible` manually or extend the classifier.
- GC contours from parcellaire dissolve are only as complete as the imported
  parcellaire coverage (full national import improves fidelity).

## Alternatives considered

- Delete redundant rows — rejected: they are real INAO products and useful for
  provenance / future product filters.
- Client-only filters — rejected: tiles would still ship heavy overlapping
  polygons.
- Keep aires-geo GC envelopes — rejected: 51 identical multipolygons make the
  cru layer unreadable.
