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
        │  Python: scripts/import_meteo_france.py             │
        │  (CSV daily → daily_weather → compute indicators)   │
        └─────────────────────────────────────────────────────┘
```

## Layers

- **`src/lib`** — pure, framework-free domain logic. No React, no I/O.
  - `types.ts`: the domain types (mirror the SQL model).
  - `indicators.ts`: flag derivation, summaries, metadata, thresholds.
  - `format.ts`: presentation helpers.
- **`src/data`** — data access for V1.
  - `regions.ts`: region metadata, baselines, GeoJSON footprints.
  - `synthetic.ts`: deterministic daily generator → monthly + indicators.
  - `soils.ts`, `scores.ts`: synthetic soils and generic scores.
- **`src/components`** — React UI (client where stateful/interactive).
- **`src/app`** — routes.
- **`supabase/migrations`** — append-only SQL (PostGIS + 7 core tables).
- **`scripts`** — Python ingestion/computation.

## V1 data flow

The frontend imports the synthetic engine directly (pure TS). No database or
network is required to run the demo. When wiring real data, replace the data
accessors (`getRegionVintages`, `getVintage`, …) with Supabase queries that read
`region_vintage_climate`, keeping the same return types.

## Why these choices

See `docs/decisions/` (ADRs):
- 0001 — Next.js + Supabase + PostGIS
- 0002 — daily weather first
- 0003 — side panel on desktop

## Conventions

Naming and commands: see `AGENTS.md` §7–8.
