#!/usr/bin/env python3
"""
Normalize Météo-France daily climatological CSV files into this project's
`daily_weather` import format.

Target output columns:
  station_id, obs_date, t_min_c, t_max_c, t_mean_c, precip_mm,
  humidity_pct, wind_ms, sunshine_h, radiation_mj, source_type

Typical usage with a downloaded Météo-France file:
  python scripts/export_meteo_france_daily.py \
    --input QUOT_departement_33_periode_1950-2024_RR-T-Vent.csv.gz \
    --station 33281001 \
    --year-start 2000 --year-end 2024 \
    --out data/import/daily_weather_bordeaux.csv

Usage with automatic discovery through data.gouv.fr metadata:
  python scripts/export_meteo_france_daily.py \
    --department 33 --period 1950-2024 \
    --station 33281001 \
    --year-start 2000 --year-end 2024 \
    --out data/import/daily_weather_bordeaux.csv

Notes:
- Official Météo-France daily RR/T/Vent fields are provided in tenths
  (RR in 1/10 mm; TN/TX/TM/TNTXM in 1/10 °C; FFM in 1/10 m/s). This script
  converts them to project units by default. Use --raw-units if your source has
  already been converted.
- If TM is missing, the script uses TNTXM, then (TN + TX) / 2 as a fallback.
"""

from __future__ import annotations

import argparse
import csv
import gzip
import io
import json
import sys
import urllib.request
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, Iterable, Iterator, List, Optional, Sequence, TextIO, Tuple

DATASET_API_URL = "https://www.data.gouv.fr/api/1/datasets/donnees-climatologiques-de-base-quotidiennes/"
OUTPUT_COLUMNS = [
    "station_id",
    "obs_date",
    "t_min_c",
    "t_max_c",
    "t_mean_c",
    "precip_mm",
    "humidity_pct",
    "wind_ms",
    "sunshine_h",
    "radiation_mj",
    "source_type",
]
STATION_COLUMNS = [
    "station_id",
    "name",
    "lat",
    "lon",
    "altitude_m",
    "source_type",
]
MISSING_VALUES = {"", "mq", "m", "nan", "na", "n/a", "null", "none", "-999", "-9999"}
PERIOD_ALIASES = {
    "before-1949": "avant-1949",
    "avant-1949": "avant-1949",
    "1950-2024": "1950-2024",
    "2025-2026": "2025-2026",
    "latest": "2025-2026",
}


@dataclass(frozen=True)
class Counters:
    read_rows: int = 0
    written_rows: int = 0
    skipped_station: int = 0
    skipped_date: int = 0
    skipped_empty_core: int = 0


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Export Météo-France daily climatological CSV files to the project daily_weather CSV format."
    )
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument(
        "--input",
        action="append",
        help="Local path or URL to a Météo-France CSV/CSV.GZ file. Can be repeated.",
    )
    source.add_argument(
        "--department",
        help="French department code used to auto-discover the RR-T-Vent resource on data.gouv.fr, e.g. 33.",
    )
    parser.add_argument(
        "--period",
        default="1950-2024",
        choices=sorted(PERIOD_ALIASES.keys()),
        help="Period resource to use with --department. Defaults to 1950-2024.",
    )
    parser.add_argument(
        "--family",
        default="RR-T-Vent",
        choices=["RR-T-Vent", "autres-parametres"],
        help="Météo-France resource family to auto-discover. Defaults to RR-T-Vent.",
    )
    parser.add_argument(
        "--station",
        action="append",
        default=[],
        help="Météo-France NUM_POSTE to keep. Can be repeated. If omitted, all stations in the file are exported.",
    )
    parser.add_argument("--year-start", type=int, help="First year to keep, inclusive.")
    parser.add_argument("--year-end", type=int, help="Last year to keep, inclusive.")
    parser.add_argument(
        "--out",
        required=True,
        help="Output CSV path in daily_weather format.",
    )
    parser.add_argument(
        "--stations-out",
        help="Optional station metadata CSV path, useful before creating weather_stations rows.",
    )
    parser.add_argument(
        "--raw-units",
        action="store_true",
        help="Do not divide Météo-France tenth-unit values by 10. Use only if the input is already in °C/mm/m/s.",
    )
    parser.add_argument(
        "--strict-quality",
        action="store_true",
        help="Blank values whose quality column is present and not in --accepted-quality.",
    )
    parser.add_argument(
        "--accepted-quality",
        default="0,1,9",
        help="Comma-separated accepted quality codes when --strict-quality is enabled. Defaults to 0,1,9.",
    )
    parser.add_argument(
        "--source-type",
        default="real",
        choices=["real", "synthetic", "manual"],
        help="source_type value to write. Defaults to real.",
    )
    return parser.parse_args(argv)


def normalize_station_id(value: object) -> str:
    text = "" if value is None else str(value).strip()
    if text.endswith(".0") and text.replace(".0", "", 1).isdigit():
        text = text[:-2]
    return text


def normalize_department(value: str) -> str:
    text = value.strip().upper()
    if text.isdigit():
        return text.zfill(2)
    return text


def normalize_period(value: str) -> str:
    return PERIOD_ALIASES[value]


def is_url(value: str) -> bool:
    return value.startswith("http://") or value.startswith("https://")


def fetch_json(url: str) -> dict:
    request = urllib.request.Request(url, headers={"User-Agent": "wine-climate-import/1.0"})
    with urllib.request.urlopen(request) as response:  # nosec: user-provided URL is not used here
        return json.loads(response.read().decode("utf-8"))


def discover_resource_url(department: str, period: str, family: str) -> str:
    dept = normalize_department(department)
    normalized_period = normalize_period(period)
    expected_parts = [
        "QUOT",
        f"departement_{dept}",
        f"periode_{normalized_period}",
        family,
    ]
    dataset = fetch_json(DATASET_API_URL)
    resources = dataset.get("resources", [])
    matches: List[Tuple[str, str]] = []

    for resource in resources:
        title = str(resource.get("title") or resource.get("description") or "")
        url = str(resource.get("url") or "")
        haystack = f"{title} {url}"
        if all(part in haystack for part in expected_parts):
            matches.append((title, url))

    if not matches:
        available = [
            str(r.get("title") or r.get("url") or "")
            for r in resources
            if f"departement_{dept}" in str(r.get("title") or r.get("url") or "")
        ]
        sample = "\n  - ".join(available[:20]) or "aucune ressource trouvée pour ce département"
        raise SystemExit(
            "Ressource data.gouv.fr introuvable pour "
            f"département={dept}, période={normalized_period}, famille={family}.\n"
            f"Ressources proches:\n  - {sample}"
        )

    # There should be exactly one resource. If several match, the first one is usually the latest active URL.
    return matches[0][1]


@contextmanager
def open_text_source(path_or_url: str) -> Iterator[TextIO]:
    if is_url(path_or_url):
        request = urllib.request.Request(path_or_url, headers={"User-Agent": "wine-climate-import/1.0"})
        response = urllib.request.urlopen(request)  # nosec: CLI tool intentionally reads user-provided URLs
        try:
            raw = response  # type: ignore[assignment]
            if path_or_url.endswith(".gz") or response.headers.get("Content-Type", "").lower().endswith("gzip"):
                gz = gzip.GzipFile(fileobj=raw)
                text = io.TextIOWrapper(gz, encoding="utf-8", newline="")
            else:
                text = io.TextIOWrapper(raw, encoding="utf-8", newline="")
            try:
                yield text
            finally:
                text.close()
        finally:
            response.close()
    else:
        path = Path(path_or_url)
        if path.suffix == ".gz":
            with gzip.open(path, mode="rt", encoding="utf-8", newline="") as handle:
                yield handle
        else:
            with path.open(mode="r", encoding="utf-8", newline="") as handle:
                yield handle


def parse_float(value: object, *, scale: float = 1.0) -> Optional[float]:
    if value is None:
        return None
    text = str(value).strip().replace(",", ".")
    if text.lower() in MISSING_VALUES:
        return None
    try:
        return float(text) * scale
    except ValueError:
        return None


def parse_int(value: object) -> Optional[int]:
    if value is None:
        return None
    text = str(value).strip()
    if text.lower() in MISSING_VALUES:
        return None
    try:
        return int(float(text))
    except ValueError:
        return None


def parse_obs_date(value: object) -> Optional[str]:
    text = "" if value is None else str(value).strip()
    if not text or text.lower() in MISSING_VALUES:
        return None
    if text.endswith(".0"):
        text = text[:-2]
    for fmt in ("%Y%m%d", "%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def in_year_window(obs_date: str, year_start: Optional[int], year_end: Optional[int]) -> bool:
    year = int(obs_date[:4])
    if year_start is not None and year < year_start:
        return False
    if year_end is not None and year > year_end:
        return False
    return True


def format_optional_float(value: Optional[float], digits: int = 2) -> str:
    if value is None:
        return ""
    rounded = round(value, digits)
    # Keep compact values for CSV while staying stable for DB imports.
    return f"{rounded:.{digits}f}".rstrip("0").rstrip(".")


def quality_ok(row: Dict[str, str], quality_column: str, accepted_quality: set[str]) -> bool:
    quality = str(row.get(quality_column, "")).strip()
    if not quality:
        return True
    return quality in accepted_quality


def read_metric(
    row: Dict[str, str],
    column: str,
    *,
    quality_column: Optional[str],
    accepted_quality: set[str],
    strict_quality: bool,
    scale: float,
) -> Optional[float]:
    if column not in row:
        return None
    if strict_quality and quality_column and quality_column in row:
        if not quality_ok(row, quality_column, accepted_quality):
            return None
    return parse_float(row.get(column), scale=scale)


def daily_row_from_source(
    row: Dict[str, str],
    *,
    station_filter: set[str],
    year_start: Optional[int],
    year_end: Optional[int],
    scale: float,
    source_type: str,
    strict_quality: bool,
    accepted_quality: set[str],
) -> Tuple[Optional[Dict[str, str]], str]:
    station_id = normalize_station_id(row.get("NUM_POSTE"))
    if station_filter and station_id not in station_filter:
        return None, "station"

    obs_date = parse_obs_date(row.get("AAAAMMJJ"))
    if obs_date is None or not in_year_window(obs_date, year_start, year_end):
        return None, "date"

    t_min_c = read_metric(row, "TN", quality_column="QTN", accepted_quality=accepted_quality, strict_quality=strict_quality, scale=scale)
    t_max_c = read_metric(row, "TX", quality_column="QTX", accepted_quality=accepted_quality, strict_quality=strict_quality, scale=scale)
    t_mean_c = read_metric(row, "TM", quality_column="QTM", accepted_quality=accepted_quality, strict_quality=strict_quality, scale=scale)
    if t_mean_c is None:
        t_mean_c = read_metric(row, "TNTXM", quality_column="QTNTXM", accepted_quality=accepted_quality, strict_quality=strict_quality, scale=scale)
    if t_mean_c is None and t_min_c is not None and t_max_c is not None:
        t_mean_c = (t_min_c + t_max_c) / 2

    precip_mm = read_metric(row, "RR", quality_column="QRR", accepted_quality=accepted_quality, strict_quality=strict_quality, scale=scale)
    humidity_pct = read_metric(row, "UM", quality_column="QUM", accepted_quality=accepted_quality, strict_quality=strict_quality, scale=1.0)
    wind_ms = read_metric(row, "FFM", quality_column="QFFM", accepted_quality=accepted_quality, strict_quality=strict_quality, scale=scale)
    sunshine_h = read_metric(row, "INST", quality_column="QINST", accepted_quality=accepted_quality, strict_quality=strict_quality, scale=scale)
    radiation_mj = read_metric(row, "GLOT", quality_column="QGLOT", accepted_quality=accepted_quality, strict_quality=strict_quality, scale=scale)

    if t_min_c is None and t_max_c is None and t_mean_c is None and precip_mm is None:
        return None, "empty_core"

    return {
        "station_id": station_id,
        "obs_date": obs_date,
        "t_min_c": format_optional_float(t_min_c),
        "t_max_c": format_optional_float(t_max_c),
        "t_mean_c": format_optional_float(t_mean_c),
        "precip_mm": format_optional_float(precip_mm),
        "humidity_pct": format_optional_float(humidity_pct),
        "wind_ms": format_optional_float(wind_ms),
        "sunshine_h": format_optional_float(sunshine_h),
        "radiation_mj": format_optional_float(radiation_mj),
        "source_type": source_type,
    }, "ok"


def station_metadata_from_row(row: Dict[str, str], *, source_type: str) -> Dict[str, str]:
    station_id = normalize_station_id(row.get("NUM_POSTE"))
    lat = parse_float(row.get("LAT"), scale=0.000001)
    lon = parse_float(row.get("LON"), scale=0.000001)
    altitude = parse_int(row.get("ALTI"))
    return {
        "station_id": station_id,
        "name": str(row.get("NOM_USUEL") or "").strip(),
        "lat": format_optional_float(lat, digits=6),
        "lon": format_optional_float(lon, digits=6),
        "altitude_m": "" if altitude is None else str(altitude),
        "source_type": source_type,
    }


def iter_dict_rows(path_or_url: str) -> Iterator[Dict[str, str]]:
    with open_text_source(path_or_url) as handle:
        # Météo-France files are semicolon-separated. utf-8 BOM is possible in some mirrors.
        reader = csv.DictReader(handle, delimiter=";")
        if reader.fieldnames:
            reader.fieldnames = [name.strip().lstrip("\ufeff") for name in reader.fieldnames]
        for row in reader:
            yield {str(key).strip().lstrip("\ufeff"): (value or "").strip() for key, value in row.items() if key is not None}


def export_daily_weather(args: argparse.Namespace) -> Counters:
    inputs = list(args.input or [])
    if args.department:
        inputs = [discover_resource_url(args.department, args.period, args.family)]
        print(f"Source détectée: {inputs[0]}", file=sys.stderr)

    station_filter = {normalize_station_id(value) for value in args.station}
    accepted_quality = {code.strip() for code in args.accepted_quality.split(",") if code.strip()}
    scale = 1.0 if args.raw_units else 0.1

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    station_out_path = Path(args.stations_out) if args.stations_out else None
    if station_out_path:
        station_out_path.parent.mkdir(parents=True, exist_ok=True)

    counters = {
        "read_rows": 0,
        "written_rows": 0,
        "skipped_station": 0,
        "skipped_date": 0,
        "skipped_empty_core": 0,
    }
    seen_daily: set[Tuple[str, str]] = set()
    seen_stations: set[str] = set()

    station_file = station_out_path.open("w", encoding="utf-8", newline="") if station_out_path else None
    try:
        with out_path.open("w", encoding="utf-8", newline="") as out_file:
            writer = csv.DictWriter(out_file, fieldnames=OUTPUT_COLUMNS)
            writer.writeheader()

            station_writer = None
            if station_file is not None:
                station_writer = csv.DictWriter(station_file, fieldnames=STATION_COLUMNS)
                station_writer.writeheader()

            for input_source in inputs:
                for source_row in iter_dict_rows(input_source):
                    counters["read_rows"] += 1
                    if station_writer is not None:
                        station_id = normalize_station_id(source_row.get("NUM_POSTE"))
                        if station_id and station_id not in seen_stations:
                            station_writer.writerow(station_metadata_from_row(source_row, source_type=args.source_type))
                            seen_stations.add(station_id)

                    normalized, reason = daily_row_from_source(
                        source_row,
                        station_filter=station_filter,
                        year_start=args.year_start,
                        year_end=args.year_end,
                        scale=scale,
                        source_type=args.source_type,
                        strict_quality=args.strict_quality,
                        accepted_quality=accepted_quality,
                    )
                    if normalized is None:
                        if reason == "station":
                            counters["skipped_station"] += 1
                        elif reason == "date":
                            counters["skipped_date"] += 1
                        elif reason == "empty_core":
                            counters["skipped_empty_core"] += 1
                        continue

                    key = (normalized["station_id"], normalized["obs_date"])
                    if key in seen_daily:
                        continue
                    seen_daily.add(key)
                    writer.writerow(normalized)
                    counters["written_rows"] += 1
    finally:
        if station_file is not None:
            station_file.close()

    return Counters(**counters)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    counters = export_daily_weather(args)
    print(
        "Export terminé: "
        f"{counters.written_rows} lignes écrites, "
        f"{counters.read_rows} lignes lues, "
        f"{counters.skipped_station} filtrées par station, "
        f"{counters.skipped_date} filtrées par date, "
        f"{counters.skipped_empty_core} sans TN/TX/TM/RR.",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
