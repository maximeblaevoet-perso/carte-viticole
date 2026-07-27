# Carte viticole — millésimes & climat

A web application for exploring French wine vintages through climate, region by
region. The map is the entry point; a right-side panel on desktop or bottom
sheet on mobile connects a selected area and vintage to climate indicators,
monthly charts, soils, optional scores, and source information.

> Climate facts come first, interpretation comes second, and provenance is
> always visible. The default demo uses deterministic **synthetic** climate and
> editorial geometry; neither is presented as observed or official data.

## Current capabilities

- Twelve French wine regions and vintages from 2000 through 2024.
- A non-uniform hierarchy from region to sub-region, village, cru, or parcel
  where the available data supports it.
- Region-relative climate profiles, headline indicators, and monthly charts.
- A vintage detail page and two-vintage comparison within one region.
- Optional Supabase reads for precomputed real climate aggregates.
- PostGIS schema, ingestion tools, and zoom-gated MVT delivery for sourced wine
  geodata, with the synthetic map retained as a fallback.

See [`docs/product-spec.md`](docs/product-spec.md) for scope and status, or
[`docs/README.md`](docs/README.md) for the complete documentation map.

## Quick start

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. No database or environment file is required for
the default synthetic mode.

Useful checks:

```bash
npm run typecheck
npm run lint
npm run build
python -m unittest discover -s scripts -p "test_ingest_wine_geodata.py"
```

The basemap and Inter web font require network access at runtime or build time;
the application shell and synthetic data do not.

## Data modes

| Mode | Configuration | Behaviour |
| --- | --- | --- |
| Synthetic (default) | No variables, or `NEXT_PUBLIC_DATA_SOURCE=synthetic` | Uses deterministic climate data and provisional editorial contours. |
| Real-enabled | `NEXT_PUBLIC_DATA_SOURCE=real` plus both public Supabase variables | Reads `region_vintage_climate` from Supabase and enables real MVT map layers; missing rows and read errors fall back to synthetic climate. |

To enable Supabase, copy `.env.example` to `.env.local` for the Next.js app and
replace every placeholder. Python import scripts read a project-root `.env` (or
exported shell variables) for server-side credentials.

```dotenv
NEXT_PUBLIC_DATA_SOURCE=real
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-publishable-or-anon-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only: never prefix it with `NEXT_PUBLIC_`,
send it to the browser, or commit a real value. The MVT route prefers this key
server-side and can fall back to the public anonymous key when database policy
allows it.

## Routes

- `/` — map and selected area/vintage panel.
- `/regions/[region]/vintage/[year]` — vintage fiche with Climat, Sols, Notes,
  Sources, and Méthodologie tabs.
- `/compare?region=&a=&b=` — two vintages in the same region.
- `/api/tiles/wine/[z]/[x]/[y]` — server-side proxy for PostGIS MVT tiles;
  returns `204` when unavailable.

## Project layout

```text
src/app                 App Router pages and the MVT route handler
src/components          map, panels, charts, fiche, and comparison UI
src/data                data access, synthetic engine, metadata, and seed geometry
src/lib                 pure domain types, indicators, and formatting
src/hooks               client data-loading hooks
supabase/migrations     append-only PostGIS schema, seeds, and tile function
scripts                 weather and wine-geodata download/ingestion tools
docs                    product, UX, architecture, data, methodology, and ADRs
```

## Real-data pipeline

Apply all migrations in numeric order before importing data. For local Supabase,
the typical flow is:

```bash
npx supabase start
npx supabase db reset
```

Weather pipeline:

```bash
python scripts/fetch_meteo_france_open_data.py --start-year 2000 --end-year 2024
python scripts/import_meteo_france_to_supabase.py
python scripts/import_meteo_france_to_supabase.py --commit
```

Wine-geodata pipeline (offline fixtures first):

```bash
python scripts/ingest_wine_geodata.py --fixture-dir scripts/fixtures/wine-geodata --scope all-initial
python -m unittest discover -s scripts -p "test_ingest_wine_geodata.py"
```

The first importer command is a dry run. Climate daily observations remain the
computation source but are not uploaded by default; the UI reads precomputed
`region_vintage_climate` rows and their monthly JSON rollups. Wine-geodata
commands, source caveats, and commit examples are documented in
[`scripts/README.md`](scripts/README.md).
The separate `scripts.test_wine_geodata_download` suite includes a live API
smoke test and therefore requires working network access and a valid remote TLS
certificate chain.

## Integrity rules

- `synthetic`, `real`, and `manual` values must remain distinguishable.
- Never replace or silently combine observed data with generated data.
- Preserve `source_type`, confidence, licences, attribution, and geographic
  disclaimer fields.
- Keep `src/lib/types.ts` aligned with append-only SQL migrations.
- Read [`AGENTS.md`](AGENTS.md) before changing the repository.
