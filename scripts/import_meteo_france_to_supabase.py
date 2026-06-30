#!/usr/bin/env python3
"""Import the normalized Météo-France project CSVs into Supabase.

This loads the *project* CSVs (comma-separated, already aligned with the SQL
model in ``supabase/migrations/0002_core_tables.sql``), NOT the raw
Météo-France downloads. Generate them first with
``scripts/fetch_meteo_france_open_data.py``.

Inputs (default ``data/meteo-france``):
    - weather_stations.csv        -> weather_stations
    - region_weather_stations.csv -> region_weather_stations
    - daily_weather.csv           -> daily_weather
    - region_vintage_climate.csv  -> region_vintage_climate

Tables are imported in dependency order. The importer runs in dry-run mode by
default; pass ``--commit`` to write through the PostgREST API with the service
role key. Upserts are idempotent and streamed in batches, so the large
``daily_weather`` file is never held fully in memory. Imported rows are tagged
``source_type=real`` and the importer refuses to silently overwrite existing
``synthetic`` rows (use ``--allow-overwrite-synthetic`` to override). Nothing is
ever deleted.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from dataclasses import dataclass
from datetime import datetime
from typing import Callable, Iterator, Optional
from urllib import error, parse, request

from dotenv import load_dotenv

CSV_DELIMITER = ","
DEFAULT_BATCH_SIZE = 500
DEFAULT_DATA_DIR = os.path.join("data", "meteo-france")
SOURCE_TYPE = "real"

# Allow CSV files to span very large daily exports.
csv.field_size_limit(10 * 1024 * 1024)


@dataclass
class Stats:
    read: int = 0
    error: int = 0


# ---------------------------------------------------------------------------
# Value parsing helpers
# ---------------------------------------------------------------------------
def _clean_text(raw: Optional[str]) -> Optional[str]:
    if raw is None:
        return None
    cleaned = raw.strip().replace("\xa0", "").replace("\u202f", "")
    return cleaned or None


def _to_float(raw: Optional[str]) -> Optional[float]:
    cleaned = _clean_text(raw)
    if cleaned is None or cleaned.lower() in {"nan", "na", "mq", "m", "nd"}:
        return None
    try:
        return float(cleaned.replace(" ", "").replace(",", "."))
    except ValueError:
        return None


def _to_int(raw: Optional[str]) -> Optional[int]:
    value = _to_float(raw)
    return int(round(value)) if value is not None else None


def _to_json(raw: Optional[str]) -> Optional[object]:
    cleaned = _clean_text(raw)
    if cleaned is None:
        return None
    return json.loads(cleaned)


def _parse_date(raw: Optional[str]) -> Optional[str]:
    cleaned = _clean_text(raw)
    if cleaned is None:
        return None
    for fmt in ("%Y-%m-%d", "%Y%m%d"):
        try:
            return datetime.strptime(cleaned, fmt).date().isoformat()
        except ValueError:
            continue
    raise ValueError(f"Unrecognised date format: {raw!r}")


# ---------------------------------------------------------------------------
# Per-table streaming parsers. Each yields PostgREST payload dicts and updates
# the shared Stats counters (read / error).
# ---------------------------------------------------------------------------
def _reader(path: str, required: set[str]):
    fh = open(path, newline="", encoding="utf-8-sig")
    reader = csv.DictReader(fh, delimiter=CSV_DELIMITER)
    if reader.fieldnames is None:
        fh.close()
        raise ValueError(f"{path}: empty CSV (no header row).")
    missing = sorted(required - set(reader.fieldnames))
    if missing:
        fh.close()
        raise ValueError(f"{path}: missing required columns: {', '.join(missing)}")
    return fh, reader


def parse_weather_stations(path: str, stats: Stats) -> Iterator[dict[str, object]]:
    fh, reader = _reader(path, {"id", "name", "latitude", "longitude"})
    with fh:
        for row in reader:
            stats.read += 1
            station_id = _clean_text(row.get("id"))
            name = _clean_text(row.get("name"))
            lat = _to_float(row.get("latitude"))
            lon = _to_float(row.get("longitude"))
            if station_id is None or name is None or lat is None or lon is None:
                stats.error += 1
                continue
            payload: dict[str, object] = {
                "id": station_id,
                "name": name,
                # PostgreSQL casts EWKT text to geometry(Point, 4326).
                "location": f"SRID=4326;POINT({lon} {lat})",
                "source_type": SOURCE_TYPE,
            }
            elevation = _to_float(row.get("altitude_m") or row.get("elevation_m"))
            if elevation is not None:
                payload["elevation_m"] = elevation
            yield payload


def parse_region_weather_stations(
    path: str, stats: Stats
) -> Iterator[dict[str, object]]:
    fh, reader = _reader(path, {"region_id", "station_id"})
    with fh:
        for row in reader:
            stats.read += 1
            region_id = _clean_text(row.get("region_id"))
            station_id = _clean_text(row.get("station_id"))
            if region_id is None or station_id is None:
                stats.error += 1
                continue
            payload: dict[str, object] = {
                "region_id": region_id,
                "station_id": station_id,
            }
            weight = _to_float(row.get("weight"))
            if weight is not None:
                payload["weight"] = weight
            yield payload


def parse_daily_weather(path: str, stats: Stats) -> Iterator[dict[str, object]]:
    fh, reader = _reader(path, {"station_id", "obs_date"})
    numeric_cols = (
        "t_min_c",
        "t_max_c",
        "t_mean_c",
        "precip_mm",
        "humidity_pct",
        "wind_ms",
        "sunshine_h",
        "radiation_mj",
    )
    with fh:
        for row in reader:
            stats.read += 1
            station_id = _clean_text(row.get("station_id"))
            row_source = _clean_text(row.get("source_type"))
            try:
                obs_date = _parse_date(row.get("obs_date"))
            except ValueError:
                obs_date = None
            if station_id is None or obs_date is None:
                stats.error += 1
                continue
            if row_source is not None and row_source != SOURCE_TYPE:
                # Refuse to relabel non-real CSV rows as real.
                stats.error += 1
                continue
            payload: dict[str, object] = {
                "station_id": station_id,
                "obs_date": obs_date,
                "source_type": SOURCE_TYPE,
            }
            for col in numeric_cols:
                value = _to_float(row.get(col))
                if value is not None:
                    payload[col] = value
            yield payload


def parse_region_vintage_climate(
    path: str, stats: Stats
) -> Iterator[dict[str, object]]:
    fh, reader = _reader(path, {"region_id", "vintage_year"})
    numeric_cols = (
        "growing_season_temp_c",
        "gdd",
        "rain_apr_sep_mm",
        "rain_jul_aug_mm",
        "rain_sep_mm",
        "water_stress_index",
        "harvest_rain_risk_index",
        "confidence",
    )
    int_cols = (
        "days_above_30",
        "days_above_35",
        "spring_frost_days",
        "longest_dry_spell_days",
    )
    with fh:
        for row in reader:
            stats.read += 1
            region_id = _clean_text(row.get("region_id"))
            year = _to_int(row.get("vintage_year"))
            row_source = _clean_text(row.get("source_type"))
            if region_id is None or year is None:
                stats.error += 1
                continue
            if row_source is not None and row_source != SOURCE_TYPE:
                stats.error += 1
                continue
            payload: dict[str, object] = {
                "region_id": region_id,
                "vintage_year": year,
                "source_type": SOURCE_TYPE,
            }
            for col in numeric_cols:
                value = _to_float(row.get(col))
                if value is not None:
                    payload[col] = value
            for col in int_cols:
                value = _to_int(row.get(col))
                if value is not None:
                    payload[col] = value
            summary = _clean_text(row.get("summary"))
            if summary is not None:
                payload["summary"] = summary
            try:
                flags = _to_json(row.get("flags"))
                monthly = _to_json(row.get("monthly"))
            except json.JSONDecodeError:
                stats.error += 1
                continue
            if flags is not None:
                payload["flags"] = flags
            if monthly is not None:
                payload["monthly"] = monthly
            yield payload


@dataclass
class TableSpec:
    name: str
    filename: str
    on_conflict: str
    parser: Callable[[str, Stats], Iterator[dict[str, object]]]
    # Leading key column used by the synthetic-overwrite guard. None when the
    # table has no source_type column (region_weather_stations).
    guard_column: Optional[str]


# Dependency order: stations -> region<->station map -> daily -> computed.
IMPORT_ORDER: list[TableSpec] = [
    TableSpec("weather_stations", "weather_stations.csv", "id", parse_weather_stations, "id"),
    TableSpec(
        "region_weather_stations",
        "region_weather_stations.csv",
        "region_id,station_id",
        parse_region_weather_stations,
        None,
    ),
    TableSpec(
        "daily_weather",
        "daily_weather.csv",
        "station_id,obs_date",
        parse_daily_weather,
        "station_id",
    ),
    TableSpec(
        "region_vintage_climate",
        "region_vintage_climate.csv",
        "region_id,vintage_year",
        parse_region_vintage_climate,
        "region_id",
    ),
]


# ---------------------------------------------------------------------------
# Supabase / PostgREST helpers
# ---------------------------------------------------------------------------
def _chunked(items: list, size: int) -> Iterator[list]:
    for start in range(0, len(items), size):
        yield items[start : start + size]


def _resolve_env() -> tuple[Optional[str], Optional[str]]:
    url = os.environ.get("SUPABASE_URL")
    key = (
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        or os.environ.get("SUPABASE_SERVICE_KEY")
        or os.environ.get("SUPABASE_KEY")
    )
    return url, key


def _headers(service_key: str) -> dict[str, str]:
    return {
        "apikey": service_key,
        "authorization": f"Bearer {service_key}",
        "content-type": "application/json",
        "accept": "application/json",
    }


def find_synthetic_collisions(
    spec: TableSpec, path: str, supabase_url: str, service_key: str
) -> set[str]:
    """Return leading-key values that already exist in the DB as synthetic."""
    if spec.guard_column is None:
        return set()

    # Collect the distinct leading-key values present in this import.
    keys: set[str] = set()
    for payload in spec.parser(path, Stats()):
        value = payload.get(spec.guard_column)
        if value is not None:
            keys.add(str(value))
    if not keys:
        return set()

    base = supabase_url.rstrip("/") + f"/rest/v1/{spec.name}"
    headers = _headers(service_key)
    found: set[str] = set()
    for chunk in _chunked(sorted(keys), 100):
        quoted = ",".join('"' + v.replace('"', '""') + '"' for v in chunk)
        query = parse.urlencode(
            {
                "select": spec.guard_column,
                "source_type": "eq.synthetic",
                spec.guard_column: f"in.({quoted})",
            }
        )
        req = request.Request(f"{base}?{query}", headers=headers, method="GET")
        try:
            with request.urlopen(req) as resp:
                rows = json.loads(resp.read().decode("utf-8"))
        except error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(
                f"Synthetic-guard query failed on {spec.name} ({exc.code}): "
                f"{body or exc.reason}"
            ) from exc
        for row in rows:
            value = row.get(spec.guard_column)
            if value is not None:
                found.add(str(value))
    return found


def _post_batch(
    endpoint: str, headers: dict[str, str], batch: list[dict[str, object]]
) -> None:
    body = json.dumps(batch, ensure_ascii=False).encode("utf-8")
    req = request.Request(endpoint, data=body, headers=headers, method="POST")
    with request.urlopen(req) as resp:
        resp.read()


def upsert_table(
    spec: TableSpec,
    path: str,
    supabase_url: str,
    service_key: str,
    batch_size: int,
) -> tuple[Stats, int, int]:
    """Stream-upsert one table. Returns (stats, written, batch_errors)."""
    endpoint = (
        supabase_url.rstrip("/")
        + f"/rest/v1/{spec.name}?on_conflict={spec.on_conflict}"
    )
    headers = _headers(service_key)
    headers["prefer"] = "resolution=merge-duplicates,return=minimal"

    stats = Stats()
    written = 0
    errors = 0
    batch: list[dict[str, object]] = []

    def flush() -> None:
        nonlocal written, errors, batch
        if not batch:
            return
        try:
            _post_batch(endpoint, headers, batch)
            written += len(batch)
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            errors += len(batch)
            print(
                f"  ! {spec.name}: batch of {len(batch)} failed "
                f"({exc.code}): {detail or exc.reason}",
                file=sys.stderr,
            )
        except error.URLError as exc:
            errors += len(batch)
            print(f"  ! {spec.name}: network error: {exc.reason}", file=sys.stderr)
        batch = []

    for payload in spec.parser(path, stats):
        batch.append(payload)
        if len(batch) >= batch_size:
            flush()
    flush()
    return stats, written, errors


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def _resolve_paths(args: argparse.Namespace) -> Optional[list[tuple[TableSpec, str]]]:
    overrides = {
        "weather_stations.csv": args.stations,
        "region_weather_stations.csv": args.region_stations,
        "daily_weather.csv": args.daily,
        "region_vintage_climate.csv": args.vintage,
    }
    selected = set(args.only) if args.only else None

    resolved: list[tuple[TableSpec, str]] = []
    for spec in IMPORT_ORDER:
        if selected is not None and spec.name not in selected:
            continue
        override = overrides[spec.filename]
        path = override or os.path.join(args.data_dir, spec.filename)
        if not os.path.exists(path):
            if selected is not None or override:
                print(f"ERROR: {spec.name}: file not found: {path}", file=sys.stderr)
                return None
            print(f"table={spec.name} skipped (missing {path})")
            continue
        resolved.append((spec, path))
    return resolved


def main(argv: Optional[list[str]] = None) -> int:
    load_dotenv()

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--data-dir",
        default=DEFAULT_DATA_DIR,
        help=f"Directory holding the project CSVs (default: {DEFAULT_DATA_DIR}).",
    )
    parser.add_argument("--stations", help="Override path to weather_stations.csv.")
    parser.add_argument(
        "--region-stations", help="Override path to region_weather_stations.csv."
    )
    parser.add_argument("--daily", help="Override path to daily_weather.csv.")
    parser.add_argument("--vintage", help="Override path to region_vintage_climate.csv.")
    parser.add_argument(
        "--only",
        nargs="+",
        choices=[spec.name for spec in IMPORT_ORDER],
        help="Import only the listed tables (default: all present).",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=DEFAULT_BATCH_SIZE,
        help=f"Upsert batch size (default: {DEFAULT_BATCH_SIZE}).",
    )
    parser.add_argument(
        "--allow-overwrite-synthetic",
        action="store_true",
        help="Allow upserting real rows over existing synthetic rows.",
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--commit", action="store_true", help="Write to Supabase.")
    mode.add_argument("--dry-run", action="store_true", help="Force dry-run mode.")
    args = parser.parse_args(argv)

    try:
        resolved = _resolve_paths(args)
    except (ValueError, OSError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    if resolved is None:
        return 1
    if not resolved:
        print("Nothing to import.", file=sys.stderr)
        return 1

    if not args.commit:
        for spec, path in resolved:
            stats = Stats()
            imported = sum(1 for _ in spec.parser(path, stats))
            print(
                f"mode=dry-run table={spec.name} lues={stats.read} "
                f"importées={imported} erreurs={stats.error}"
            )
        print("dry-run: no data written. Re-run with --commit to write.")
        return 0

    supabase_url, service_key = _resolve_env()
    if not supabase_url or not service_key:
        print(
            "ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.",
            file=sys.stderr,
        )
        return 1

    # Synthetic-overwrite guard: never silently flip synthetic -> real.
    if not args.allow_overwrite_synthetic:
        try:
            for spec, path in resolved:
                collisions = find_synthetic_collisions(
                    spec, path, supabase_url, service_key
                )
                if collisions:
                    sample = ", ".join(sorted(collisions)[:5])
                    print(
                        f"ERROR: {spec.name}: {len(collisions)} existing synthetic "
                        f"row(s) collide with this real import (e.g. {sample}). "
                        "Refusing to mix silently. Re-run with "
                        "--allow-overwrite-synthetic to override.",
                        file=sys.stderr,
                    )
                    return 1
        except RuntimeError as exc:
            print(f"ERROR: {exc}", file=sys.stderr)
            return 1

    exit_code = 0
    for spec, path in resolved:
        stats, written, batch_errors = upsert_table(
            spec, path, supabase_url, service_key, args.batch_size
        )
        total_errors = stats.error + batch_errors
        print(
            f"mode=commit table={spec.name} lues={stats.read} "
            f"importées={written} erreurs={total_errors}"
        )
        if batch_errors:
            exit_code = 1
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
