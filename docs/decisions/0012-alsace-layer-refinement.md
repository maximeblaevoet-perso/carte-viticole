# ADR 0012 — Alsace layers: no synthetic/real stacking, cru tier colour, named lieux-dits

## Status

Accepted — 2026-09-12

## Context

ADR 0010 made the real Alsace layers progressive, but five readability problems
remained when zooming from France down to a single cru.

1. **Synthetic and real contours were painted on top of each other.** The map
   always drew the rough editorial footprints of `src/data/geo.ts` *and*, when
   Supabase is configured, the real INAO contours streamed as MVT. For Alsace
   that meant a near-rectangle labelled “Alsace” next to the accurate outline
   (badged “Contour informatif”), plus a second rectangle for the level-2
   “Alsace Grand Cru” node. The rough footprints are documented as provisional
   placeholders, so nothing told the client to retire them once real geometry
   arrived.
2. **“Alsace Grand Cru” (level 2) covered the whole region.** ADR 0010 promoted
   the INAO generic `Alsace grand cru` denomination onto that node, but the
   INAO polygon for a parent denomination is the *parent AOC* footprint, i.e.
   the entire Alsatian vineyard — not the crus. The label therefore claimed
   every plot in Alsace was grand cru.
3. **Grands crus were coloured like their region.** A grand cru read as “more
   Alsace”, when it is a quality tier that exists identically in Alsace,
   Bourgogne and Champagne.
4. **Non-wine SIQO were on the map.** `inao-aires-geo` catalogues every
   protected product, and the Alsace scope filter matched on the word
   “alsace” — so Choucroute d’Alsace, Miel d’Alsace, Volailles d’Alsace, Pâtes
   d’Alsace, the fruit eaux-de-vie and Whisky d’Alsace were ingested as wine
   appellations and painted as such.
5. **The high-zoom “parcellaire” named everything “Crémant d’Alsace”.** The
   INAO parcellaire is not cadastral: each row is an *aire délimitée* for one
   `commune × denomination`. For Alsace that is 334 rows of which 117 are AOC
   Alsace and 117 Crémant d’Alsace — two copies of the whole vineyard — plus
   the grand-cru aires that the level-4 cru contours were already dissolved
   from (ADR 0010). Every hover returned an appellation name, never a place.

## Decision

1. **Suppress synthetic footprints where real contours exist.** Migration 0010
   adds the `wine_real_coverage` view (root regions with at least one non-null
   `geom`). `/api/wine/coverage` exposes just the region ids, server-side key
   only, and `WineMap` filters its synthetic layers with
   `rootRegionId NOT IN coverage`. A failed or empty fetch leaves the synthetic
   layers on, so the map is never blank — it degrades toward the placeholder,
   never toward nothing.
2. **Rebuild the level-2 grand-cru node as the union of the named crus.** Both
   migration 0010 (existing data) and `rebuild_alsace_gc_envelope`
   (re-ingest) dissolve the visible level-4 grand-cru contours into
   `alsace-grand-cru`, and set its `region_type` to `grand-cru`. `RegionType`
   is deliberately decoupled from `AreaLevel`, so a level-2 grand cru is legal.
3. **Colour by cru tier, not by region.** `grand-cru` → `#c0202f`,
   `premier-cru` → `#d9736f`, everything else keeps its root-region hue. The
   rule lives in `colorFor` (synthetic) and `regionColorExpression` (MVT) so
   the two paths cannot drift. Hue alone is not enough over satellite imagery:
   a cru also gets `+0.18` fill opacity and `+1.2` line width, and the basemap
   themes — which repaint every outline one colour so it survives imagery —
   now keep the tier colour for crus instead of flattening them to white.
   Champagne lieux-dits keep their own gold tint: they are tinted by their
   *commune*’s classification, which is a different statement from “this shape
   is a grand cru”.
4. **Make the parcel layer carry information.** `wine_parcels.map_visible`
   mirrors `wine_areas.map_visible`. Hidden for Alsace: the two regional
   product AOCs, and every aire whose denomination is already drawn as a
   level-4 cru. Kept: the sub-appellation aires (Alsace Bergheim, Ottrott, …)
   whose level-3 areas fade at z11, so above that zoom the aire is the only
   remaining delimitation. The popup now says “Aire délimitée INAO” instead of
   letting the appellation read as a parcel name.
5. **Keep only viticultural SIQO.** `product_is_wine` gates every scoped row
   on the INAO `categorie` field, which must start with “Vin” (“Vin
   tranquille”, “Vin mousseux \"Crémant\"”, “Vin de sélection de grains
   nobles”…). Fruit eaux-de-vie and marc de raisin are excluded: they are
   spirits, not wine. A row with no `categorie` is kept — the column is absent
   from some exports and dropping on a missing field loses data silently.
   Migration 0011 deletes the eleven rows already ingested.
6. **Ingest the cadastral lieux-dits for Alsace.** Departments 67/68 ship
   ~150 000 named lieux-dits covering forests and towns, so the cadastre is
   clipped to the AOC Alsace aire before anything is kept (5 997 rows). They
   are attached to the grand cru that geometrically contains them (382 rows),
   or to nothing — a lieu-dit is never assigned a cru by guesswork. Alsace crus
   cut across communes, so the Champagne `commune → area` index does not apply
   and `process_cadastre_lieux_dits` takes an `area_resolver` instead.

## Consequences

- Zooming into Alsace now reads: L1 region (real INAO outline, alone) →
  sub-appellations + the red grand-cru union → individual crus in red →
  named cadastral lieux-dits over the cru contours (hovering a plot inside
  Vorbourg answers “RUMPELSTEIN · Lieu-dit · Grand Cru Alsace grand cru
  Vorbourg”, where it used to answer “Crémant d’Alsace”).
- Alsace keeps 13 wine sub-appellations at level 3 instead of 24 rows mixing in
  sauerkraut, honey and poultry.
- `wine_lieux_dits` grows from 2 567 (Champagne only) to ~8 500 rows.
- Any region that gains real contours automatically retires its synthetic
  footprint — no per-region flag to maintain.
- Regions with no real data are unaffected and keep their editorial shapes,
  still badged as provisional.
- `WINE_TILES_VERSION` is bumped: the geometry of `alsace-grand-cru` and the
  parcel visibility both change what a tile contains.

## Alternatives considered

- **Hardcode the covered regions in the client** — rejected: it silently rots
  the day a new region is ingested.
- **Delete the synthetic Alsace geometry** — rejected: the seed tree must keep
  working with no database at all (AGENTS.md §2).
- **Delete the redundant INAO parcels** — rejected, same reason as ADR 0010:
  they are real INAO products, useful for provenance and product filters.
  `map_visible` hides them from the map without losing the record.
- **Label the parcels with `commune × appellation`** — rejected as the answer
  to “I want parcel names”: it is still not a place name. The cadastre is.
- **Ingest all 67/68 lieux-dits** — rejected: ~150 000 rows, the large majority
  outside any vineyard.
- **Hide the non-wine SIQO with `map_visible`** — rejected: unlike Crémant,
  they are not wine at all, so they do not belong in a wine hierarchy even as
  hidden provenance. Deleted, and blocked at the source.
- **Filter non-wine products on the denomination text** — rejected: brittle
  (“Marc d’Alsace” is grape-derived, “Pâtes d’Alsace” is not). `categorie` is
  the field INAO maintains for exactly this.
