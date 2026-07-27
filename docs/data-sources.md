# Data sources

## Provenance model

Every value that could be observed, generated, or hand-entered carries a
`source_type`:

- `synthetic` — generated demo data. Always visibly labelled. Never shown as real.
- `real` — observed data ingested from an external provider (Météo-France).
- `manual` — human-entered values.

Never mix `synthetic` and `real` silently. See `AGENTS.md` §6.

## V1 status

All climate series currently displayed are **synthetic**, generated
deterministically in `src/data/synthetic.ts` (seeded by `regionId:year`). They
demonstrate the pipeline but are not real observations. Confidence is set low
(0.4) on purpose.

## Météo-France (target real source)

Intended source for real daily weather: Météo-France public climatological data
("données climatologiques de base – quotidiennes").

- Granularity: **daily** (the V1 source granularity).
- Typical columns: `NUM_POSTE`, `AAAAMMJJ`, `TX`, `TN`, `TM`, `RR`, plus optional
  `UM` (humidity), `FFM` (wind), `INST` (sunshine), `GLOT` (radiation).
- Files are semicolon-separated.
- Published QUOT CSV values are already in **°C and mm** (one decimal). The
  official field descriptor says « en °C et 1/10 » for 0.1° precision, not for
  integer tenths requiring a `/10` conversion.

Open-data fetching and normalization live in
`scripts/fetch_meteo_france_open_data.py`.
Project-CSV import into Supabase lives in
`scripts/import_meteo_france_to_supabase.py` (stations, region↔station mapping,
and region×vintage climate, in dependency order).
Adjust the normalization to the exact export you download, then verify the CSV
columns against `supabase/migrations/0002_core_tables.sql` before importing.

### Daily weather: computed locally, not pushed to Supabase

`daily_weather` remains the **source granularity** for reliable computation, but
it is **not pushed to Supabase by default**: the table is very large (millions
of rows) and the frontend never reads it. Daily CSVs are kept locally and used
to derive the monthly and weekly rollups + indicators stored in
`region_vintage_climate`, which is what the UI serves (both chart granularities
included). See ADR 0005 and ADR 0008. The import script skips `daily_weather`
unless explicitly requested (`--only daily_weather`).

### Priority V1 variables

- daily min / max / mean temperature
- daily precipitation
- days > 30 °C, days > 35 °C
- spring frost days
- cumulative rain Apr–Sep, Jul–Aug, September
- longest dry spell

Humidity, wind, sunshine, radiation are modelled in the schema but **not**
prioritised in the V1 UI.

## Wine geodata (target real sources)

Hierarchical map geometry and fine parcels will be ingested from public French
open data. Every row carries `source_type` plus `source_datasets` metadata.
**Never** present informative INAO contours as official boundaries.

| Dataset id | Source | Role |
| ---------- | ------ | ---- |
| `inao-siqo` | [SIQO INAO](https://www.data.gouv.fr/datasets/referentiel-des-produits-sous-signe-officiel-didentification-de-la-qualite-et-de-lorigine-siqo) | Product/appellation referential (CSV, no geom) |
| `inao-aires-produits` | [Aires AOC/AOP/IGP](https://www.data.gouv.fr/datasets/aires-et-produits-aoc-aop-et-igp) | Tabular aires ↔ produits (CSV) |
| `inao-aires-geo` | [Aires géographiques SIQO](https://www.data.gouv.fr/datasets/delimitation-des-aires-geographiques-des-siqo) | Appellation area polygons (`is_informative`) |
| `inao-parcellaire` | [Parcellaire INAO](https://www.data.gouv.fr/datasets/delimitation-parcellaire-des-aoc-viticoles-de-linao) | Fine AOC parcels → `wine_parcels` |
| `ign-rpg` | [RPG IGN](https://cartes.gouv.fr/aide/fr/partenaires/ign/referentiels-description-territoire/vegetation-agriculture/rpg/) | Declared vine plots — enrichment only |
| `etalab-cadastre` | [Cadastre Etalab](https://cadastre.data.gouv.fr/datasets) | Parcel refs + `wine_lieux_dits` |

### Regional scope (initial)

- **Alsace:** 51 Alsace Grand Cru as `wine_areas` (level 3–4, `region_type =
  grand-cru`), geometry from INAO when imported.
- **Champagne:** Grand Cru / Premier Cru = **communes** in `wine_areas`; fine
  display uses `wine_parcels` + `wine_lieux_dits` (cadastre), not nested hierarchy.
- **Bourgogne:** schema ready (climats, 1ers crus); full import deferred.

### V1 status (geodata)

Seed contours in `src/data/geo.ts` remain `source_type = synthetic` /
`provisional`. Migration `0005_wine_geodata.sql` creates tables and catalogs
sources only — **no geometry imported yet**. Frontend reads via
`src/data/wine-geodata.ts` with seed fallback until real rows exist.

Ingestion script: `scripts/ingest_wine_geodata.py` (dry-run on fixtures or
local raw files; `--commit` for Supabase write). See `scripts/README.md`.

Methodology inspiration: [open-wine-map](https://github.com/devloed-com/open-wine-map/)
(future Python ingest scripts — not part of this change).

## External scores

The `vintage_scores` table is a **generic** container. V1 does not integrate any
protected/proprietary critic. Do **not** scrape Parker or any protected
wine-review content. Manually entered scores must use `source_type = 'manual'`.
