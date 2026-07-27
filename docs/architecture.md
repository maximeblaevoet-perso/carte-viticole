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
   GeoJSON ever reaches the browser. See ADR 0007.

Clicking a real feature produces a `SelectedGeoFeature` (area / parcel /
lieu-dit + provenance) that the panel renders with a source/provenance card.
If Supabase is off, the route returns `204` and only the synthetic base shows.

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

## Conventions

Naming and commands: see `AGENTS.md` §7–8.
