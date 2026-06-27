#!/usr/bin/env python3
"""Skeleton importer for Météo-France daily weather CSV files.

This is a STARTING POINT, not a finished pipeline. It shows the intended shape:

    CSV (daily observations)  ->  normalise  ->  upsert into `daily_weather`

Design rules (see docs/data-sources.md and AGENTS.md):
  * The source granularity for V1 is DAILY.
  * Imported real observations MUST be tagged `source_type = "real"`.
  * Never overwrite real data with synthetic data.
  * Do not scrape protected/proprietary content.

Usage (dry-run by default, prints what it would insert):
    python import_meteo_france.py --csv path/to/file.csv --station 07510
    python import_meteo_france.py --csv path/to/file.csv --station 07510 --commit

Environment:
    DATABASE_URL   PostgreSQL connection string (required only with --commit)
"""

from __future__ import annotations

import argparse
import csv
import os
import sys
from dataclasses import dataclass, asdict
from datetime import date, datetime
from typing import Iterable, Iterator, Optional


# --- column mapping ---------------------------------------------------------
# Météo-France public "données climatologiques de base - quotidiennes" use
# semicolon-separated files with columns such as: NUM_POSTE, AAAAMMJJ, TX, TN,
# TM, RR. Adjust this mapping to the exact export you downloaded.
COLUMN_MAP = {
    "date": "AAAAMMJJ",   # YYYYMMDD
    "t_max_c": "TX",      # daily max temperature
    "t_min_c": "TN",      # daily min temperature
    "t_mean_c": "TM",     # daily mean temperature
    "precip_mm": "RR",    # daily precipitation
    # Secondary (optional) variables:
    "humidity_pct": "UM",
    "wind_ms": "FFM",
    "sunshine_h": "INST",
    "radiation_mj": "GLOT",
}

CSV_DELIMITER = ";"


@dataclass
class DailyRow:
    station_id: str
    obs_date: date
    t_min_c: Optional[float]
    t_max_c: Optional[float]
    t_mean_c: Optional[float]
    precip_mm: Optional[float]
    humidity_pct: Optional[float]
    wind_ms: Optional[float]
    sunshine_h: Optional[float]
    radiation_mj: Optional[float]
    source_type: str = "real"


def _to_float(raw: Optional[str]) -> Optional[float]:
    if raw is None:
        return None
    raw = raw.strip().replace(",", ".")
    if raw == "" or raw.lower() in {"nan", "na", "mq"}:
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def _parse_date(raw: str) -> date:
    raw = raw.strip()
    # Météo-France daily files: YYYYMMDD. Fall back to ISO if needed.
    for fmt in ("%Y%m%d", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Unrecognised date format: {raw!r}")


def parse_csv(path: str, station_id: str) -> Iterator[DailyRow]:
    """Yield normalised DailyRow objects from a Météo-France CSV export."""
    with open(path, newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh, delimiter=CSV_DELIMITER)
        if reader.fieldnames is None:
            raise ValueError("Empty CSV (no header row).")

        def col(row: dict, key: str) -> Optional[str]:
            source_col = COLUMN_MAP.get(key)
            return row.get(source_col) if source_col else None

        for row in reader:
            date_raw = col(row, "date")
            if not date_raw:
                continue
            yield DailyRow(
                station_id=station_id,
                obs_date=_parse_date(date_raw),
                t_min_c=_to_float(col(row, "t_min_c")),
                t_max_c=_to_float(col(row, "t_max_c")),
                t_mean_c=_to_float(col(row, "t_mean_c")),
                precip_mm=_to_float(col(row, "precip_mm")),
                humidity_pct=_to_float(col(row, "humidity_pct")),
                wind_ms=_to_float(col(row, "wind_ms")),
                sunshine_h=_to_float(col(row, "sunshine_h")),
                radiation_mj=_to_float(col(row, "radiation_mj")),
                source_type="real",
            )


UPSERT_SQL = """
insert into daily_weather (
    station_id, obs_date, t_min_c, t_max_c, t_mean_c, precip_mm,
    humidity_pct, wind_ms, sunshine_h, radiation_mj, source_type
) values (
    %(station_id)s, %(obs_date)s, %(t_min_c)s, %(t_max_c)s, %(t_mean_c)s, %(precip_mm)s,
    %(humidity_pct)s, %(wind_ms)s, %(sunshine_h)s, %(radiation_mj)s, %(source_type)s
)
on conflict (station_id, obs_date) do update set
    t_min_c = excluded.t_min_c,
    t_max_c = excluded.t_max_c,
    t_mean_c = excluded.t_mean_c,
    precip_mm = excluded.precip_mm,
    humidity_pct = excluded.humidity_pct,
    wind_ms = excluded.wind_ms,
    sunshine_h = excluded.sunshine_h,
    radiation_mj = excluded.radiation_mj,
    source_type = excluded.source_type
-- Guard: never let synthetic data overwrite real observations.
where daily_weather.source_type <> 'real' or excluded.source_type = 'real';
"""


def upsert_rows(rows: Iterable[DailyRow], database_url: str) -> int:
    """Upsert rows into PostgreSQL. Requires psycopg (v3) or psycopg2."""
    try:
        import psycopg  # type: ignore

        conn = psycopg.connect(database_url)
    except ImportError:
        try:
            import psycopg2 as psycopg  # type: ignore

            conn = psycopg.connect(database_url)
        except ImportError:
            print(
                "ERROR: install 'psycopg[binary]' (or psycopg2) to use --commit.",
                file=sys.stderr,
            )
            raise

    count = 0
    with conn:
        with conn.cursor() as cur:
            for row in rows:
                cur.execute(UPSERT_SQL, asdict(row))
                count += 1
    conn.close()
    return count


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", required=True, help="Path to the Météo-France CSV file.")
    parser.add_argument("--station", required=True, help="Station id to attach the rows to.")
    parser.add_argument(
        "--commit",
        action="store_true",
        help="Actually write to the DB (default: dry-run preview).",
    )
    parser.add_argument("--limit", type=int, default=10, help="Preview row count (dry-run).")
    args = parser.parse_args(argv)

    rows = list(parse_csv(args.csv, args.station))
    print(f"Parsed {len(rows)} daily rows for station {args.station}.")

    if not args.commit:
        print("\nDRY-RUN preview (use --commit to write):")
        for row in rows[: args.limit]:
            print(
                f"  {row.obs_date}  Tn={row.t_min_c}  Tx={row.t_max_c}  "
                f"Tm={row.t_mean_c}  RR={row.precip_mm}  [{row.source_type}]"
            )
        if len(rows) > args.limit:
            print(f"  ... {len(rows) - args.limit} more")
        return 0

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL is not set.", file=sys.stderr)
        return 1

    written = upsert_rows(rows, database_url)
    print(f"Upserted {written} rows into daily_weather.")
    # TODO: after import, recompute region_vintage_climate for the affected
    # region x vintage(s). See docs/climate-methodology.md for definitions.
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
