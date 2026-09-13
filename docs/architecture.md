# Architecture

## Overview

```
                ┌──────────────────────────────────────────┐
                │              Next.js (App Router)          │
                │                                            │
  MapLibre  ◄───┤  src/app/page.tsx → ExplorerApp           │
                │     ├─ WineMap (client)                    │
                │     └─ RegionPanelContent (panel / sheet)  │
                │  src/app/regions/[region]/vintage/[year]   │
                │  src/app/compare                           │
                │                                            │
                │  src/lib   (pure domain: types, indicators)│
                │  src/data  (synthetic engine, regions)     │
                └───────────────┬────────────────────────────┘
                                │ synthetic by default
                                │ real aggregates when explicitly enabled
                                ▼
        ┌───────────────────────────────────────────────────┐
        │     Supabase: PostgreSQL + PostGIS                  │
        │     supabase/migrations/*.sql                       │
        └───────────────┬───────────────────────────────────┘
                        ▲
                        │ upsert (source_type='real')
        ┌───────────────┴───────────────────────────────────┐
        │  Python weather + wine-geodata tooling               │
        │  (open data → normalized files → Supabase tables)    │
        └─────────────────────────────────────────────────────┘
```

## Layers

- **`src/lib`** — pure, framework-free domain logic. No React, no I/O.
  - `types.ts`: the domain types (mirror the SQL model).
  - `indicators.ts`: flag derivation, summaries, metadata, thresholds.
  - `climate-series.ts`: turns the `monthly` / `weekly` rollups into one
    chart-ready series (labels + nullable values) so the UI is granularity-blind.
  - `format.ts`: presentation helpers.
- **`src/data`** — data access for V1.
  - `regions.ts`: region metadata, baselines, GeoJSON footprints (level 1).
  - `areas.ts`: hierarchical `WineArea` tree (région → cru → parcelle) + helpers.
  - `wine-geodata.ts`: Supabase/PostGIS seam for `wine_areas`, `wine_parcels`,
    `wine_lieux_dits` with seed fallback (ADR 0006).
  - `geo.ts`: geographic contours (kept SEPARATE from the hierarchy), keyed by
    `geoJsonId`, plus the per-region colour palette.
  - `synthetic.ts`: deterministic daily generator → monthly + weekly rollups +
    indicators.
  - `climate.ts`: climate data-access seam. Reads `region_vintage_climate` from
    Supabase when configured, falls back to synthetic. Returns the existing TS
    types; never queries `daily_weather` (see ADR 0005).
  - `soils.ts`: synthetic region soils + finer area soils with fallback resolver.
  - `scores.ts`: generic scores (no protected source).
- **`src/lib/supabase.ts`** — minimal client factory + `shouldUseSupabase()`
  gate (needs `NEXT_PUBLIC_SUPABASE_*` and `NEXT_PUBLIC_DATA_SOURCE=real`).
- **`src/hooks`** — client hooks (`useClimate.ts`) that seed interactive client
  components with synthetic data instantly, then upgrade to Supabase async.
- **`src/components`** — React UI (client where stateful/interactive).
- **`src/app`** — routes, including the vector-tile endpoint
  `api/tiles/wine/[z]/[x]/[y]` (server-side MVT proxy, see below).
- **`supabase/migrations`** — append-only SQL (PostGIS + core tables + the
  `wine_mvt(z,x,y)` tile function in `0007` + the `weekly` rollup in `0008`).
- **`scripts`** — Python ingestion/computation.

## Map geodata flow (real vs synthetic)

The map has two stacked sources:

1. **Synthetic base** — editorial GeoJSON contours (`src/data/geo.ts`) merged
   with the in-memory hierarchy (`src/data/areas.ts`). Always present; sole
   source of truth in demo mode.
2. **Real PostGIS layers (MVT)** — added on top only when `shouldUseSupabase()`
   is true. MapLibre pulls vector tiles from `/api/tiles/wine/{z}/{x}/{y}`; the
   route proxies the PostGIS `wine_mvt(z,x,y)` function through PostgREST and
   returns a Mapbox Vector Tile. The Supabase key stays server-side — the client
   only sees the relative tile URL. Layers: `wine-areas-region`,
   `wine-areas-appellation`, `wine-areas-cru`, `wine-parcels`,
   `wine-lieux-dits(-labels)`. Zoom-gated + zoom-simplified in SQL so no massive
   GeoJSON ever reaches the browser. See ADR 0007. From migration `0009` /
   ADR 0010, tiles also honour `map_visible` and per-row `zoom_min`/`zoom_max`,
   and appellation layers fade before crus (`z < 11`, MapLibre `maxzoom`
   aligned with `LEVEL_ZOOM`). Tile URLs include `?v=` from
   `WINE_TILES_VERSION` / `NEXT_PUBLIC_WINE_TILES_VERSION` so a post-ingest
   bump busts CDN/browser caches (hard refresh alone does not). Migration
   `0010` / ADR 0012 adds `wine_parcels.map_visible` to the same filtering.

The two families are mutually exclusive per region: `/api/wine/coverage` reads
the `wine_real_coverage` view and `WineMap` filters its synthetic layers to the
regions with no real contour, so a rough editorial footprint is never painted
next to the accurate one (ADR 0012). A failed fetch keeps the synthetic layers
on — the map degrades toward the placeholder, never toward nothing.

Clicking a real feature produces a `SelectedGeoFeature` (area / parcel /
lieu-dit + provenance) that the panel renders with a source/provenance card.
If Supabase is off, the route returns `204` and only the synthetic base shows.

### Basemaps (ADR 0011)

Under those wine layers sits a **switchable raster basemap**, declared in
`src/lib/basemaps.ts` and driven by `src/components/map/BasemapSwitcher.tsx`:
`aerial` (IGN Orthophotos, default), `plan` (IGN Plan v2), `geology` (BRGM —
WMS, loaded only when selected because it has no CDN). There is no relief
overlay: Plan v2 is already shaded.

In the geology view, clicking the map runs a BRGM WMS `GetFeatureInfo` against
`LITHO_1M_SIMPLIFIEE` (`src/lib/geology-info.ts`, pure URL builder + parser) and
`GeologyReadout.tsx` names the rock family under the point, with its 1/1 000 000
precision stated on the card.

Switching a basemap only removes/adds the `basemap` raster layer and its source,
re-inserted *before* the lowest wine layer: the GeoJSON and MVT sources are never
touched, so no tile refetch and no loss of hover/selection state. Each basemap
carries a `theme` that repaints the wine layers' outlines and labels (white on
imagery, near-black on geology) — colours only; geometry and zoom bands are
untouched. Attribution is per source ("© IGN / Géoplateforme", "© BRGM").

## V1 data flow

The frontend reads climate through `src/data/climate.ts`
(`getVintageClimate`, `getRegionVintageClimates`). When Supabase is configured
for real data it queries `region_vintage_climate` (including both the `monthly`
and `weekly` rollups, so the chart toggle needs no extra request); otherwise it
falls back to the synthetic engine. No database or network is required to run the
demo. The frontend never reads `daily_weather` — that table is the
ingestion/computation source only (ADRs 0002, 0005 and 0008).

## Runtime configuration

The default mode is synthetic and requires no environment variables. Real mode
is an explicit opt-in; setting credentials alone does not switch the UI.

| Variable | Exposure | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_DATA_SOURCE` | Browser-visible | Must equal `real` to enable Supabase-backed reads and MVT overlays. |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser-visible | Supabase project URL used by the frontend data-access layer. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser-visible | Publishable/anonymous key used for permitted frontend reads. |
| `SUPABASE_URL` | Server-only | Project URL used by Python importers and preferred by the MVT route. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only secret | Commit/import access and preferred MVT RPC credential; never expose or commit it. |

When any climate query fails or has no matching row, the climate adapter returns
the deterministic synthetic record, whose `sourceType` remains `synthetic`.
When the tile route lacks configuration or cannot produce a tile, it returns
`204`; MapLibre continues to display the seed geometry.

## Why these choices

See `docs/decisions/` (ADRs):
- 0001 — Next.js + Supabase + PostGIS
- 0002 — daily weather first
- 0003 — side panel on desktop
- 0004 — hierarchical wine areas (see also `docs/wine-hierarchy.md`)
- 0005 — serve monthly climate aggregates to the frontend
- 0006 — hybrid PostGIS wine geodata (`wine_areas` + `wine_parcels`)
- 0007 — serve wine geodata as MVT vector tiles (`wine_mvt` + `/api/tiles/wine`)
- 0008 — add a weekly climate rollup next to the monthly one
- 0010 — map visibility + progressive zoom for wine areas
- 0011 — switchable public basemaps (IGN / BRGM)
- 0012 — Alsace layers: no synthetic/real stacking, cru tier colour, named
  lieux-dits

## Conventions

Naming and commands: see `AGENTS.md` §7–8.
