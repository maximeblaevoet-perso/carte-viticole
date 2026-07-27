# Scripts (Python)

This folder contains the Python tooling for Météo-France data. V1 weather
source granularity stays **daily**.

## Setup

```bash
cd scripts
python -m venv .venv
# Windows: .venv\Scripts\activate   |   macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
```

For `--commit`, the importer loads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
from `.env` at the project root (or `.env.example` if `.env` is missing).
`SUPABASE_URL` falls back to `NEXT_PUBLIC_SUPABASE_URL` when unset.

## Générer les CSV depuis l'open data Météo-France

`scripts/fetch_meteo_france_open_data.py` downloads and normalizes the public
open data into project CSV files:

- `weather_stations.csv`
- `weather_stations_staging.csv`
- `region_weather_stations.csv`
- `daily_weather.csv`
- `region_vintage_climate.csv`

The raw `csv.gz` files stay in `data/meteo-france/raw/`; the project CSVs are
written next to it in `data/meteo-france/`.

Examples:

```bash
python scripts/fetch_meteo_france_open_data.py --url "https://www.data.gouv.fr/datasets/donnees-climatologiques-de-base-quotidiennes" --start-year 2000 --end-year 2024 --out-dir data/meteo-france
python scripts/fetch_meteo_france_open_data.py --regions bordeaux --start-year 2000 --end-year 2024 --out-dir data/meteo-france-bordeaux
python scripts/fetch_meteo_france_open_data.py --url "https://object.files.data.gouv.fr/meteofrance/data/synchro_ftp/BASE/QUOT/Q_33_previous-1950-2024_RR-T-Vent.csv.gz" --regions bordeaux --start-year 2000 --end-year 2024 --out-dir data/meteo-france-bordeaux
python scripts/fetch_meteo_france_open_data.py --transform-only --out-dir data/meteo-france
```

Notes:

- The script uses only the Python standard library.
- Daily temperatures and rain come from Météo-France columns **TN**, **TX**,
  **TM**, and **RR**. Published QUOT CSV files already use °C and mm with one
  decimal (the official descriptor « en °C et 1/10 » means 0.1 precision, not
  integer tenths to divide).
- `weather_stations.csv` is a project export, not a direct `\copy` match for
  `supabase/migrations/0002_core_tables.sql`: SQL expects `elevation_m` and a
  `location` geometry, while the CSV carries `latitude`, `longitude`,
  `altitude_m`, and `department`. Transform it before import, or load it through
  a staging step.
- `weather_stations_staging.csv` is the staging export for Supabase: it carries
  `elevation_m` plus a WKT `location_wkt` that can be converted with
  `ST_GeomFromText(location_wkt, 4326)` in a staging table or `INSERT ... SELECT`.
  Example:

  ```sql
  insert into weather_stations (id, name, elevation_m, location, source_type, department)
  select
    id,
    name,
    elevation_m,
    ST_GeomFromText(location_wkt, 4326),
    source_type,
    department
  from weather_stations_stage;
  ```
- `region_weather_stations.csv` maps directly to `region_weather_stations`.
- `daily_weather.csv` maps directly to `daily_weather`; the optional secondary
  fields stay blank unless the source provides them.
- `region_vintage_climate.csv` matches `region_vintage_climate` except for
  `computed_at`, which is left to the database default during import.
- `--transform-only` rebuilds the project CSVs from existing files in
  `data/meteo-france/raw/` without fetching the source again.

## Importer les CSV projet dans Supabase

`scripts/import_meteo_france_to_supabase.py` imports the **normalized project
CSVs** (comma-separated, already aligned with `0002_core_tables.sql`), NOT the
raw Météo-France downloads. By default it pushes three tables in dependency
order:

1. `weather_stations` (builds the PostGIS `location` from `latitude`/`longitude`)
2. `region_weather_stations`
3. `region_vintage_climate` (parses the `flags`/`monthly` JSON columns)

`daily_weather` is **NOT pushed by default**. It is very large (millions of
rows) and the frontend never reads it — the UI consumes the pre-computed
`region_vintage_climate` aggregates instead (see
[ADR 0005](../docs/decisions/0005-serve-monthly-climate-aggregates.md)). Daily
data stays a **local computation source** used to derive the monthly rollup and
indicators. It can still be pushed explicitly if it is ever (re)hosted in
Supabase: `--only daily_weather` or an explicit `--daily PATH`.

```bash
# Dry-run by default: reads the served CSVs in data/meteo-france and reports
# counts (daily_weather is skipped — see note above).
python scripts/import_meteo_france_to_supabase.py

# Actually write (idempotent upsert), still without daily_weather
python scripts/import_meteo_france_to_supabase.py --commit

# Force-push daily_weather only (rarely needed; large table)
python scripts/import_meteo_france_to_supabase.py --commit --only daily_weather
```

Useful options:

- `--data-dir DIR` — directory holding the CSVs (default `data/meteo-france`).
- `--stations / --region-stations / --daily / --vintage PATH` — override a
  single file path.
- `--only weather_stations region_vintage_climate` — import a subset of tables.
  This is also the way to force the otherwise-skipped `daily_weather`
  (`--only daily_weather`).
- `--batch-size N` — upsert batch size (default 500).
- `--allow-overwrite-synthetic` — required to overwrite existing `synthetic`
  rows; otherwise the importer aborts rather than mixing `real` and `synthetic`.

Behaviour:

- All imported rows are tagged `source_type = "real"`; rows whose CSV
  `source_type` is set to anything other than `real` are skipped (counted as
  errors) to avoid mislabeling.
- Nothing is ever deleted: existing `synthetic` data is preserved. Before
  writing, the importer queries Supabase for `synthetic` rows that collide with
  the incoming primary keys and aborts unless `--allow-overwrite-synthetic` is
  passed.
- Writes go through the PostgREST API and need `SUPABASE_URL` and
  `SUPABASE_SERVICE_ROLE_KEY` (falls back to `SUPABASE_SERVICE_KEY` /
  `SUPABASE_KEY` if present).
- Logs stay short, one line per table: `lues=… importées=… erreurs=…`.

## Ingérer la géodata viticole (INAO, cadastre)

`scripts/ingest_wine_geodata.py` + `scripts/wine_geodata_download.py` téléchargent
et importent les données vers les tables PostGIS de `0005_wine_geodata.sql`.

### Sources et APIs

| ID interne | Source | API / URL | Contenu |
| ---------- | ------ | --------- | ------- |
| `inao-siqo` | data.gouv.fr | `/api/1/datasets/referentiel-…-siqo/` | CSV référentiel produits |
| `inao-aires-produits` | data.gouv.fr | `/api/1/datasets/aires-et-produits-aoc-aop-et-igp/` | CSV aires ↔ produits |
| `inao-aires-geo` | data.gouv.fr | `/api/1/datasets/delimitation-des-aires-geographiques-des-siqo/` | Shapefile national (~85 Mo) |
| `inao-parcellaire` | data.gouv.fr | `/api/1/datasets/delimitation-parcellaire-des-aoc-viticoles-de-linao/` | Shapefile national (~255 Mo) |
| `etalab-cadastre` | cadastre.data.gouv.fr | bundler + départements GeoJSON | Lieux-dits |

Le téléchargement passe par l'API data.gouv.fr (métadonnées + URL `static.data.gouv.fr`)
et le bundler Etalab (`cadastre.data.gouv.fr/bundler/...` ou fichiers département).

### Télécharger (sans import)

```bash
# Léger : CSV INAO + lieux-dits cadastre par département (Champagne)
python scripts/ingest_wine_geodata.py --allow-download --download-only --scope champagne

# Complet : + archives INAO nationales shapefile
python scripts/ingest_wine_geodata.py --allow-download --include-national-geo --download-only --scope all-initial

# Cadastre par commune GC/PC (37 requêtes, plus fin)
python scripts/ingest_wine_geodata.py --allow-download --download-only --scope champagne --cadastre-mode commune
```

Fichiers écrits sous `data/raw/wine-geodata/` + `download-manifest.json`.

### Ingérer

```bash
# Dry-run hors-ligne sur les fixtures
python scripts/ingest_wine_geodata.py --fixture-dir scripts/fixtures/wine-geodata --scope all-initial

# Dry-run sur fichiers locaux déjà téléchargés
python scripts/ingest_wine_geodata.py --skip-download --scope alsace

# Tests
python scripts/test_ingest_wine_geodata.py
python scripts/test_wine_geodata_download.py

# Import réel
python scripts/ingest_wine_geodata.py --skip-download --scope all-initial --commit
```

**Champagne** : le shapefile national INAO parcellaire ne contient pas de lignes
Champagne (0 commune 08/10/51/52). L'import `--scope champagne` crée les
communes GC/PC (`wine_areas`) + lieux-dits cadastre (`wine_lieux_dits`), pas de
`wine_parcels`. Voir `docs/wine-hierarchy.md`.

Options : `--scope`, `--raw-dir`, `--skip-download`, `--allow-download`,
`--download-only`, `--include-national-geo`, `--cadastre-mode`, `--force-download`,
`--commit`, `--allow-overwrite-synthetic`.
