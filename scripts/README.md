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

Set `DATABASE_URL` (see `../.env.example`) before using `--commit`.

## `import_meteo_france.py`

Skeleton importer for Météo-France daily CSV exports into `daily_weather`.

```bash
# Dry-run preview (no DB writes)
python import_meteo_france.py --csv data_raw/Q_33_2018.csv --station 07510

# Actually write (upsert)
python import_meteo_france.py --csv data_raw/Q_33_2018.csv --station 07510 --commit
```

Rules enforced / intended:

- Imported observations are tagged `source_type = "real"`.
- The upsert guard never lets synthetic data overwrite real observations.
- Adjust `COLUMN_MAP` in the script to match your exact CSV export columns.

## Next steps (not implemented yet)

- `compute_region_vintage.py`: roll daily → monthly and compute the headline
  indicators per `region × vintage`, writing `region_vintage_climate`. The
  indicator definitions must match `src/lib/indicators.ts` and
  `docs/climate-methodology.md`.
