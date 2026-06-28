# Scripts (Python)

Data ingestion and computation scripts. The source granularity for V1 is
**daily** weather.

## Setup

```bash
cd scripts
python -m venv .venv
# Windows: .venv\Scripts\activate   |   macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
```

Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` before using `--commit`.

## `import_meteo_france.py`

Importer for Météo-France daily CSV exports into `daily_weather`.

```bash
# Dry-run by default
python import_meteo_france.py --csv data_raw/Q_33_2018.csv

# Actually write (upsert)
python import_meteo_france.py --csv data_raw/Q_33_2018.csv --commit
```

Each row uses `NUM_POSTE`, `AAAAMMJJ`, `TX`, `TN`, `TM`, and `RR`, and imported
observations are tagged `source_type = "real"`.

## Next steps (not implemented yet)

- `compute_region_vintage.py`: roll daily → monthly and compute the headline
  indicators per `region × vintage`, writing `region_vintage_climate`. The
  indicator definitions must match `src/lib/indicators.ts` and
  `docs/climate-methodology.md`.
