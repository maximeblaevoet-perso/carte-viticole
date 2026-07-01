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
                                │ (V1: in-memory synthetic)
                                │ (later: Supabase client)
                                ▼
        ┌───────────────────────────────────────────────────┐
        │     Supabase: PostgreSQL + PostGIS                  │
        │     supabase/migrations/*.sql                       │
        └───────────────┬───────────────────────────────────┘
                        ▲
                        │ upsert (source_type='real')
        ┌───────────────┴───────────────────────────────────┐
        │  Python: scripts/fetch_meteo_france_open_data.py    │
        │  → scripts/import_meteo_france_to_supabase.py       │
        │  (open data → project CSVs → Supabase tables)       │
        └─────────────────────────────────────────────────────┘
```

## Layers

- **`src/lib`** — pure, framework-free domain logic. No React, no I/O.
  - `types.ts`: the domain types (mirror the SQL model).
  - `indicators.ts`: flag derivation, summaries, metadata, thresholds.
  - `format.ts`: presentation helpers.
- **`src/data`** — data access for V1.
  - `regions.ts`: region metadata, baselines, GeoJSON footprints (level 1).
  - `areas.ts`: hierarchical `WineArea` tree (région → cru → parcelle) + helpers.
  - `geo.ts`: geographic contours (kept SEPARATE from the hierarchy), keyed by
    `geoJsonId`, plus the per-region colour palette.
  - `synthetic.ts`: deterministic daily generator → monthly + indicators.
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
- **`src/app`** — routes.
- **`supabase/migrations`** — append-only SQL (PostGIS + 7 core tables).
- **`scripts`** — Python ingestion/computation.

## V1 data flow

The frontend reads climate through `src/data/climate.ts`
(`getVintageClimate`, `getRegionVintageClimates`). When Supabase is configured
for real data it queries `region_vintage_climate` (including the `monthly`
rollup for charts); otherwise it falls back to the synthetic engine. No database
or network is required to run the demo. The frontend never reads `daily_weather`
— that table is the ingestion/computation source only (ADRs 0002 and 0005).

## Why these choices

See `docs/decisions/` (ADRs):
- 0001 — Next.js + Supabase + PostGIS
- 0002 — daily weather first
- 0003 — side panel on desktop
- 0004 — hierarchical wine areas (see also `docs/wine-hierarchy.md`)
- 0005 — serve monthly climate aggregates to the frontend

## Conventions

Naming and commands: see `AGENTS.md` §7–8.
