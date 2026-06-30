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

Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` before using `--commit`.

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
raw Météo-France downloads. It loads four tables in dependency order:

1. `weather_stations` (builds the PostGIS `location` from `latitude`/`longitude`)
2. `region_weather_stations`
3. `daily_weather` (streamed in batches; never held fully in memory)
4. `region_vintage_climate` (parses the `flags`/`monthly` JSON columns)

```bash
# Dry-run by default: reads every CSV in data/meteo-france and reports counts
python scripts/import_meteo_france_to_supabase.py

# Actually write (idempotent upsert)
python scripts/import_meteo_france_to_supabase.py --commit
```

Useful options:

- `--data-dir DIR` — directory holding the CSVs (default `data/meteo-france`).
- `--stations / --region-stations / --daily / --vintage PATH` — override a
  single file path.
- `--only weather_stations daily_weather` — import a subset of tables.
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
