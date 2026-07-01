#!/usr/bin/env python3
"""
Download and transform Meteo-France daily climatological data for the wine vintage
climate project.

Outputs CSV files aligned with the project data model:
- weather_stations.csv
- region_weather_stations.csv
- daily_weather.csv
- region_vintage_climate.csv

The script uses only the Python standard library. It can consume either direct
csv/csv.gz URLs or the public data.gouv.fr dataset page/API for:
"donnees-climatologiques-de-base-quotidiennes".
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import gzip
import json
import math
import os
import re
import shutil
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from contextlib import contextmanager
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

DATA_GOUV_DATASET_SLUG = "donnees-climatologiques-de-base-quotidiennes"
DATA_GOUV_API_URL = "https://www.data.gouv.fr/api/1/datasets/{slug}/"
SOURCE_TYPE = "real"
SOURCE_NAME = "Meteo-France donnees climatologiques de base quotidiennes"

# Approximate department coverage for the V1 macro wine regions.
# For production, prefer a curated station map with: region_id,station_id,weight.
REGION_DEPARTMENTS: Dict[str, List[str]] = {
    "bordeaux": ["33"],
    "bourgogne": ["21", "58", "71", "89"],
    "rhone": ["07", "26", "30", "69", "84"],
    "alsace": ["67", "68"],
    "champagne": ["02", "10", "51", "52", "77"],
    "loire": ["18", "37", "41", "44", "49", "58"],
    "corse": ["2A", "2B"],
    "provence": ["04", "06", "13", "83", "84"],
    "beaujolais": ["69", "71"],
    "jura": ["39"],
    "savoie": ["73", "74"],
    "languedoc-roussillon": ["11", "30", "34", "48", "66"],
}

REGION_NAMES = {
    "bordeaux": "Bordeaux",
    "bourgogne": "Bourgogne",
    "rhone": "Vallee du Rhone",
    "alsace": "Alsace",
    "champagne": "Champagne",
    "loire": "Loire",
    "corse": "Corse",
    "provence": "Provence",
    "beaujolais": "Beaujolais",
    "jura": "Jura",
    "savoie": "Savoie",
    "languedoc-roussillon": "Languedoc-Roussillon",
}

DAILY_WEATHER_COLUMNS = [
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

WEATHER_STATION_COLUMNS = [
    "id",
    "name",
    "latitude",
    "longitude",
    "altitude_m",
    "source_type",
    "department",
]

WEATHER_STATION_STAGING_COLUMNS = [
    "id",
    "name",
    "elevation_m",
    "location_wkt",
    "source_type",
    "department",
]

REGION_STATION_COLUMNS = ["region_id", "station_id", "weight"]

REGION_CLIMATE_COLUMNS = [
    "region_id",
    "vintage_year",
    "growing_season_temp_c",
    "gdd",
    "days_above_30",
    "days_above_35",
    "spring_frost_days",
    "rain_apr_sep_mm",
    "rain_jul_aug_mm",
    "rain_sep_mm",
    "longest_dry_spell_days",
    "water_stress_index",
    "harvest_rain_risk_index",
    "flags",
    "summary",
    "monthly",
    "source_type",
    "confidence",
]

EXPECTED_OUTPUT_HEADERS = {
    "weather_stations.csv": WEATHER_STATION_COLUMNS,
    "weather_stations_staging.csv": WEATHER_STATION_STAGING_COLUMNS,
    "region_weather_stations.csv": REGION_STATION_COLUMNS,
    "daily_weather.csv": DAILY_WEATHER_COLUMNS,
    "region_vintage_climate.csv": REGION_CLIMATE_COLUMNS,
}


@dataclass(frozen=True)
class Resource:
    url: str
    name: str
    department: Optional[str]


@dataclass
class StationInfo:
    station_id: str
    name: str = ""
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    altitude_m: Optional[float] = None
    department: Optional[str] = None


class WeightedValue:
    def __init__(self) -> None:
        self.total = 0.0
        self.weight = 0.0

    def add(self, value: Optional[float], weight: float = 1.0) -> None:
        if value is None or math.isnan(value):
            return
        self.total += value * weight
        self.weight += weight

    def value(self) -> Optional[float]:
        if self.weight == 0:
            return None
        return self.total / self.weight


class DayAccum:
    def __init__(self) -> None:
        self.t_min = WeightedValue()
        self.t_max = WeightedValue()
        self.t_mean = WeightedValue()
        self.precip = WeightedValue()

    def add(self, row: Dict[str, Optional[float]], weight: float = 1.0) -> None:
        self.t_min.add(row.get("t_min_c"), weight)
        self.t_max.add(row.get("t_max_c"), weight)
        self.t_mean.add(row.get("t_mean_c"), weight)
        self.precip.add(row.get("precip_mm"), weight)

    def as_daily(self) -> Dict[str, Optional[float]]:
        return {
            "t_min_c": self.t_min.value(),
            "t_max_c": self.t_max.value(),
            "t_mean_c": self.t_mean.value(),
            "precip_mm": self.precip.value(),
        }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Download and normalize Meteo-France daily data for the wine vintage climate project."
    )
    parser.add_argument(
        "--url",
        action="append",
        default=[],
        help=(
            "Direct csv/csv.gz URL, data.gouv.fr dataset URL, or data.gouv.fr API URL. "
            "Can be repeated. If omitted, the official daily climatological dataset is used."
        ),
    )
    parser.add_argument(
        "--regions",
        default=",".join(REGION_DEPARTMENTS.keys()),
        help="Comma-separated project region ids to process. Default: all V1 regions.",
    )
    parser.add_argument(
        "--departments",
        default="",
        help="Optional comma-separated department codes. Overrides departments inferred from --regions.",
    )
    parser.add_argument("--start-year", type=int, default=2000)
    parser.add_argument("--end-year", type=int, default=2024)
    parser.add_argument("--out-dir", default="data/meteo-france")
    parser.add_argument(
        "--station-map",
        default="",
        help="Optional CSV with columns region_id,station_id,weight. If provided, overrides department-based aggregation.",
    )
    parser.add_argument(
        "--accepted-quality",
        default="0,1,9",
        help="Comma-separated quality codes accepted per variable. Default keeps protected/validated/filtered and drops doubtful code 2.",
    )
    parser.add_argument("--force", action="store_true", help="Re-download files even if raw files already exist.")
    parser.add_argument(
        "--transform-only",
        action="store_true",
        help="Rebuild project CSVs from the existing raw/ directory without downloading anything.",
    )
    parser.add_argument(
        "--skip-region-climate",
        action="store_true",
        help="Only write station and daily_weather CSV files; skip regional indicators.",
    )
    return parser.parse_args()


def split_csv_arg(value: str) -> List[str]:
    return [part.strip() for part in value.split(",") if part.strip()]


def normalize_department(dep: str) -> str:
    dep = dep.strip().upper()
    if dep in {"2A", "2B"}:
        return dep
    if dep.isdigit():
        return dep.zfill(2) if len(dep) <= 2 else dep
    return dep


def safe_filename(value: str) -> str:
    parsed = urllib.parse.urlparse(value)
    base = Path(parsed.path).name or value
    base = re.sub(r"[^A-Za-z0-9._-]+", "_", base)
    return base[:180] or "resource.csv.gz"


def fetch_json(url: str) -> Dict[str, Any]:
    req = urllib.request.Request(url, headers={"User-Agent": "wine-climate-ingestion/1.0"})
    with urllib.request.urlopen(req, timeout=60) as response:
        data = response.read().decode("utf-8")
    return json.loads(data)


def dataset_slug_from_url(url: str) -> Optional[str]:
    parsed = urllib.parse.urlparse(url)
    parts = [part for part in parsed.path.split("/") if part]
    for index, part in enumerate(parts):
        if part == "datasets" and index + 1 < len(parts):
            return parts[index + 1]
    if "api" in parts and "datasets" in parts:
        index = parts.index("datasets")
        if index + 1 < len(parts):
            return parts[index + 1]
    return None


def parse_department_from_text(text: str) -> Optional[str]:
    patterns = [
        r"departement[_-]([0-9]{2,3}|2A|2B)",
        r"/Q[_-]([0-9]{2,3}|2A|2B)[_-]",
        r"_Q[_-]?([0-9]{2,3}|2A|2B)[_-]",
        r"QUOT[^A-Za-z0-9]+([0-9]{2,3}|2A|2B)[^A-Za-z0-9]",
    ]
    upper = text.upper()
    for pattern in patterns:
        match = re.search(pattern, upper)
        if match:
            return normalize_department(match.group(1))
    return None


def parse_period_from_text(text: str) -> Optional[Tuple[int, int]]:
    upper = text.upper()
    if "AVANT-1949" in upper or "AVANT_1949" in upper:
        return (1800, 1949)
    match = re.search(r"(19[0-9]{2}|20[0-9]{2})[-_](19[0-9]{2}|20[0-9]{2})", upper)
    if match:
        start = int(match.group(1))
        end = int(match.group(2))
        return (start, end)
    return None


def overlaps_period(text: str, start_year: int, end_year: int) -> bool:
    period = parse_period_from_text(text)
    if period is None:
        return True
    start, end = period
    return start <= end_year and end >= start_year


def resource_matches(text: str, departments: List[str], start_year: int, end_year: int) -> bool:
    upper = text.upper()
    if "RR-T-VENT" not in upper and "RR_T_VENT" not in upper:
        return False
    if "AUTRES-PARAMETRES" in upper or "AUTRES_PARAMETRES" in upper:
        return False
    dep = parse_department_from_text(text)
    if departments and dep not in departments:
        return False
    return overlaps_period(text, start_year, end_year)


def resources_from_dataset(slug: str, departments: List[str], start_year: int, end_year: int) -> List[Resource]:
    api_url = DATA_GOUV_API_URL.format(slug=slug)
    dataset = fetch_json(api_url)
    resources: List[Resource] = []
    for item in dataset.get("resources", []):
        name = item.get("title") or item.get("name") or item.get("description") or item.get("url") or "resource"
        url = item.get("url")
        if not url:
            continue
        text = f"{name} {url}"
        if resource_matches(text, departments, start_year, end_year):
            resources.append(Resource(url=url, name=name, department=parse_department_from_text(text)))
    resources.sort(key=lambda r: (r.department or "", r.name))
    return resources


def resolve_resources(urls: List[str], departments: List[str], start_year: int, end_year: int) -> List[Resource]:
    if not urls:
        return resources_from_dataset(DATA_GOUV_DATASET_SLUG, departments, start_year, end_year)

    resolved: List[Resource] = []
    for url in urls:
        slug = dataset_slug_from_url(url)
        if slug and not url.lower().endswith((".csv", ".csv.gz", ".gz")):
            resolved.extend(resources_from_dataset(slug, departments, start_year, end_year))
            continue
        text = url
        dep = parse_department_from_text(text)
        if departments and dep is not None and dep not in departments:
            continue
        if not overlaps_period(text, start_year, end_year):
            continue
        resolved.append(Resource(url=url, name=safe_filename(url), department=dep))

    # De-duplicate by URL while preserving order.
    seen = set()
    unique: List[Resource] = []
    for resource in resolved:
        if resource.url in seen:
            continue
        seen.add(resource.url)
        unique.append(resource)
    return unique


def download_resource(resource: Resource, raw_dir: Path, force: bool = False) -> Path:
    raw_dir.mkdir(parents=True, exist_ok=True)
    filename = safe_filename(resource.url)
    if not filename.endswith((".csv", ".gz")):
        filename = f"{safe_filename(resource.name)}.csv.gz"
    target = raw_dir / filename
    if target.exists() and not force:
        return target

    req = urllib.request.Request(resource.url, headers={"User-Agent": "wine-climate-ingestion/1.0"})
    tmp_fd, tmp_name = tempfile.mkstemp(prefix="meteo_", suffix=".download", dir=str(raw_dir))
    os.close(tmp_fd)
    try:
        with urllib.request.urlopen(req, timeout=300) as response, open(tmp_name, "wb") as dst:
            shutil.copyfileobj(response, dst)
        os.replace(tmp_name, target)
    except Exception:
        try:
            os.unlink(tmp_name)
        except OSError:
            pass
        raise
    return target


def download_raw(resources: List[Resource], raw_dir: Path, force: bool = False) -> List[Tuple[Resource, Path]]:
    downloaded: List[Tuple[Resource, Path]] = []
    for index, resource in enumerate(resources, start=1):
        print(f"[{index}/{len(resources)}] Downloading {resource.name}", file=sys.stderr)
        try:
            path = download_resource(resource, raw_dir, force=force)
        except (urllib.error.URLError, OSError) as exc:
            print(f"WARNING: failed to download {resource.url}: {exc}", file=sys.stderr)
            continue
        downloaded.append((resource, path))
    return downloaded


def raw_resources_from_dir(raw_dir: Path) -> List[Tuple[Resource, Path]]:
    if not raw_dir.exists():
        return []
    files = sorted(
        [path for path in raw_dir.iterdir() if path.is_file() and path.suffix.lower() in {".csv", ".gz"}],
        key=lambda path: path.name,
    )
    return [
        (
            Resource(
                url=path.resolve().as_uri(),
                name=path.name,
                department=parse_department_from_text(path.name),
            ),
            path,
        )
        for path in files
    ]


@contextmanager
def atomic_csv_writer(path: Path, fieldnames: List[str]):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_name(f"{path.name}.tmp")
    with open(tmp_path, "w", encoding="utf-8", newline="") as dst:
        writer = csv.DictWriter(dst, fieldnames=fieldnames)
        writer.writeheader()
        yield writer
    os.replace(tmp_path, path)


def open_maybe_gzip(path: Path):
    if path.name.endswith(".gz"):
        return gzip.open(path, "rt", encoding="utf-8-sig", newline="")
    return open(path, "r", encoding="utf-8-sig", newline="")


def parse_float(raw: Any) -> Optional[float]:
    if raw is None:
        return None
    value = str(raw).strip()
    if value == "" or value.upper() in {"NA", "NAN", "NULL"}:
        return None
    value = value.replace(",", ".")
    try:
        return float(value)
    except ValueError:
        return None


def parse_coordinate(raw: Any) -> Optional[float]:
    value = parse_float(raw)
    if value is None:
        return None
    # Some files expose degrees in millionths; current csv exports often expose decimals.
    if abs(value) > 1000:
        value = value / 1_000_000.0
    return value


def quality_ok(row: Dict[str, Any], column: str, accepted_quality: set[str]) -> bool:
    candidates = [f"Q{column}", f"Q_{column}", f"{column}_Q"]
    for qcol in candidates:
        if qcol in row:
            q = str(row.get(qcol, "")).strip()
            return q == "" or q in accepted_quality
    return True


def get_measure(row: Dict[str, Any], column: str, accepted_quality: set[str]) -> Optional[float]:
    if column not in row:
        return None
    if not quality_ok(row, column, accepted_quality):
        return None
    return parse_float(row.get(column))


def parse_date_yyyymmdd(value: Any) -> Optional[dt.date]:
    if value is None:
        return None
    text = str(value).strip()
    if not re.fullmatch(r"[0-9]{8}", text):
        return None
    try:
        return dt.date(int(text[0:4]), int(text[4:6]), int(text[6:8]))
    except ValueError:
        return None


def fmt(value: Optional[float], digits: int = 2) -> str:
    if value is None or math.isnan(value):
        return ""
    return f"{value:.{digits}f}".rstrip("0").rstrip(".")


def load_station_map(path: str) -> Dict[str, List[Tuple[str, float]]]:
    if not path:
        return {}
    mapping: Dict[str, List[Tuple[str, float]]] = defaultdict(list)
    with open(path, "r", encoding="utf-8-sig", newline="") as src:
        reader = csv.DictReader(src)
        required = {"region_id", "station_id", "weight"}
        missing = required - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"station-map is missing columns: {', '.join(sorted(missing))}")
        for row in reader:
            station_id = str(row["station_id"]).strip()
            region_id = str(row["region_id"]).strip()
            weight = parse_float(row["weight"])
            if station_id and region_id and weight is not None and weight > 0:
                mapping[station_id].append((region_id, weight))
    return mapping


def department_regions(regions: List[str]) -> Dict[str, List[str]]:
    result: Dict[str, List[str]] = defaultdict(list)
    for region_id in regions:
        for dep in REGION_DEPARTMENTS.get(region_id, []):
            result[normalize_department(dep)].append(region_id)
    return result


def update_station_info(stations: Dict[str, StationInfo], row: Dict[str, Any], department: Optional[str]) -> StationInfo:
    station_id = str(row.get("NUM_POSTE", "")).strip()
    info = stations.get(station_id)
    if info is None:
        info = StationInfo(station_id=station_id)
        stations[station_id] = info
    name = str(row.get("NOM_USUEL") or row.get("NOM") or "").strip()
    if name:
        info.name = name
    lat = parse_coordinate(row.get("LAT"))
    lon = parse_coordinate(row.get("LON"))
    alt = parse_float(row.get("ALTI"))
    if lat is not None:
        info.latitude = lat
    if lon is not None:
        info.longitude = lon
    if alt is not None:
        info.altitude_m = alt
    if department:
        info.department = department
    return info


def normalize_daily_row(row: Dict[str, Any], accepted_quality: set[str]) -> Dict[str, Optional[float]]:
    # Météo-France QUOT RR-T-Vent: TN/TX/TM in °C, RR in mm (one decimal in CSV).
    t_min = get_measure(row, "TN", accepted_quality)
    t_max = get_measure(row, "TX", accepted_quality)
    t_mean = get_measure(row, "TM", accepted_quality)
    if t_mean is None and t_min is not None and t_max is not None:
        t_mean = (t_min + t_max) / 2.0
    precip = get_measure(row, "RR", accepted_quality)
    if precip is not None and precip < 0:
        # M-F can encode trace precipitation with negative tiny values in some products.
        precip = 0.0
    wind = get_measure(row, "FFM", accepted_quality)
    return {
        "t_min_c": t_min,
        "t_max_c": t_max,
        "t_mean_c": t_mean,
        "precip_mm": precip,
        "wind_ms": wind,
    }


def process_resource(
    resource: Resource,
    path: Path,
    daily_writer: csv.DictWriter,
    start_date: dt.date,
    end_date: dt.date,
    accepted_quality: set[str],
    stations: Dict[str, StationInfo],
    station_map: Dict[str, List[Tuple[str, float]]],
    dep_to_regions: Dict[str, List[str]],
    region_daily: Dict[Tuple[str, dt.date], DayAccum],
    region_stations: Dict[str, set[str]],
) -> int:
    rows_written = 0
    department = resource.department
    with open_maybe_gzip(path) as src:
        reader = csv.DictReader(src, delimiter=";")
        if not reader.fieldnames:
            return 0
        reader.fieldnames = [name.strip().lstrip("\ufeff") for name in reader.fieldnames]
        for raw_row in reader:
            row = {str(k).strip().lstrip("\ufeff"): (v.strip() if isinstance(v, str) else v) for k, v in raw_row.items() if k}
            station_id = str(row.get("NUM_POSTE", "")).strip()
            obs_date = parse_date_yyyymmdd(row.get("AAAAMMJJ"))
            if not station_id or obs_date is None or obs_date < start_date or obs_date > end_date:
                continue

            info = update_station_info(stations, row, department)
            row_department = info.department or department
            daily = normalize_daily_row(row, accepted_quality)

            output = {
                "station_id": station_id,
                "obs_date": obs_date.isoformat(),
                "t_min_c": fmt(daily.get("t_min_c")),
                "t_max_c": fmt(daily.get("t_max_c")),
                "t_mean_c": fmt(daily.get("t_mean_c")),
                "precip_mm": fmt(daily.get("precip_mm")),
                "humidity_pct": "",
                "wind_ms": fmt(daily.get("wind_ms")),
                "sunshine_h": "",
                "radiation_mj": "",
                "source_type": SOURCE_TYPE,
            }
            daily_writer.writerow(output)
            rows_written += 1

            if station_map:
                mappings = station_map.get(station_id, [])
            else:
                mappings = [(region_id, 1.0) for region_id in dep_to_regions.get(row_department or "", [])]
            for region_id, weight in mappings:
                region_daily[(region_id, obs_date)].add(daily, weight)
                region_stations[region_id].add(station_id)
    return rows_written


def build_project_csvs(
    raw_inputs: List[Tuple[Resource, Path]],
    out_dir: Path,
    start_date: dt.date,
    end_date: dt.date,
    accepted_quality: set[str],
    stations: Dict[str, StationInfo],
    station_map: Dict[str, List[Tuple[str, float]]],
    dep_to_regions: Dict[str, List[str]],
    regions: List[str],
    start_year: int,
    end_year: int,
    skip_region_climate: bool,
) -> int:
    region_daily: Dict[Tuple[str, dt.date], DayAccum] = defaultdict(DayAccum)
    region_stations: Dict[str, set[str]] = defaultdict(set)
    daily_path = out_dir / "daily_weather.csv"
    total_rows = 0

    with atomic_csv_writer(daily_path, DAILY_WEATHER_COLUMNS) as daily_writer:
        for index, (resource, path) in enumerate(raw_inputs, start=1):
            print(f"[{index}/{len(raw_inputs)}] Reading {resource.name}", file=sys.stderr)
            rows = process_resource(
                resource=resource,
                path=path,
                daily_writer=daily_writer,
                start_date=start_date,
                end_date=end_date,
                accepted_quality=accepted_quality,
                stations=stations,
                station_map=station_map,
                dep_to_regions=dep_to_regions,
                region_daily=region_daily,
                region_stations=region_stations,
            )
            total_rows += rows
            print(f"  wrote {rows} daily rows", file=sys.stderr)

    write_weather_stations(out_dir / "weather_stations.csv", stations)
    write_weather_stations_staging(out_dir / "weather_stations_staging.csv", stations)
    write_region_stations(out_dir / "region_weather_stations.csv", region_stations, station_map)

    if not skip_region_climate:
        rows = compute_base_region_rows(region_daily, regions, start_year, end_year)
        write_region_climate(out_dir / "region_vintage_climate.csv", rows)
        print(f"Region vintage rows: {len(rows)}", file=sys.stderr)

    return total_rows


def validate_outputs(out_dir: Path, skip_region_climate: bool) -> None:
    filenames = [
        "weather_stations.csv",
        "weather_stations_staging.csv",
        "region_weather_stations.csv",
        "daily_weather.csv",
    ]
    if not skip_region_climate:
        filenames.append("region_vintage_climate.csv")

    for filename in filenames:
        path = out_dir / filename
        if not path.exists():
            raise SystemExit(f"Missing output file: {path}")
        with open(path, "r", encoding="utf-8", newline="") as src:
            reader = csv.DictReader(src)
            actual = reader.fieldnames or []
            expected = EXPECTED_OUTPUT_HEADERS[filename]
            if actual != expected:
                raise SystemExit(
                    f"Unexpected columns in {filename}: expected {', '.join(expected)}; got {', '.join(actual)}"
                )
            if "source_type" in actual:
                for row in reader:
                    source_type = str(row.get("source_type", "")).strip()
                    if source_type and source_type != SOURCE_TYPE:
                        raise SystemExit(f"Unexpected source_type in {filename}: {source_type!r}")


def mean(values: Iterable[Optional[float]]) -> Optional[float]:
    clean = [v for v in values if v is not None]
    if not clean:
        return None
    return sum(clean) / len(clean)


def total(values: Iterable[Optional[float]]) -> Optional[float]:
    clean = [v for v in values if v is not None]
    if not clean:
        return None
    return sum(clean)


def round_or_none(value: Optional[float], digits: int = 1) -> Optional[float]:
    if value is None:
        return None
    return round(value, digits)


def daterange(start: dt.date, end: dt.date) -> Iterable[dt.date]:
    current = start
    while current <= end:
        yield current
        current += dt.timedelta(days=1)


def longest_dry_spell(days: List[Dict[str, Any]]) -> int:
    longest = 0
    current = 0
    for day in days:
        rain = day.get("precip_mm")
        if rain is not None and rain < 1.0:
            current += 1
            longest = max(longest, current)
        else:
            current = 0
    return longest


def count_days(days: List[Dict[str, Any]], field: str, predicate) -> int:
    count = 0
    for day in days:
        value = day.get(field)
        if value is not None and predicate(value):
            count += 1
    return count


def build_monthly(year_days: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    # Keys MUST match the schema/TS contract consumed by the frontend
    # (MonthlyClimate -> t_mean_c, t_max_c, t_min_c, precip_mm). See the monthly
    # JSONB comment in 0002_core_tables.sql, src/lib/types.ts and the mapper in
    # src/data/climate.ts. The monthly rollup powers the default monthly charts.
    by_month: Dict[int, List[Dict[str, Any]]] = defaultdict(list)
    for day in year_days:
        by_month[day["date"].month].append(day)
    monthly: List[Dict[str, Any]] = []
    for month in range(1, 13):
        days = by_month.get(month, [])
        monthly.append(
            {
                "month": month,
                "t_mean_c": round_or_none(mean(day.get("t_mean_c") for day in days), 1),
                "t_max_c": round_or_none(mean(day.get("t_max_c") for day in days), 1),
                "t_min_c": round_or_none(mean(day.get("t_min_c") for day in days), 1),
                "precip_mm": round_or_none(total(day.get("precip_mm") for day in days), 1),
            }
        )
    return monthly


def expected_days_for_window(year: int, start_month: int, end_month: int) -> int:
    start = dt.date(year, start_month, 1)
    if end_month == 12:
        end = dt.date(year, 12, 31)
    else:
        end = dt.date(year, end_month + 1, 1) - dt.timedelta(days=1)
    return (end - start).days + 1


def compute_base_region_rows(
    region_daily: Dict[Tuple[str, dt.date], DayAccum],
    regions: List[str],
    start_year: int,
    end_year: int,
) -> List[Dict[str, Any]]:
    daily_by_region: Dict[str, Dict[dt.date, Dict[str, Any]]] = defaultdict(dict)
    for (region_id, obs_date), accum in region_daily.items():
        values = accum.as_daily()
        values["date"] = obs_date
        daily_by_region[region_id][obs_date] = values

    rows: List[Dict[str, Any]] = []
    for region_id in regions:
        region_days = daily_by_region.get(region_id, {})
        for year in range(start_year, end_year + 1):
            year_days = [region_days[d] for d in sorted(region_days) if d.year == year]
            if not year_days:
                continue
            apr_sep = [d for d in year_days if 4 <= d["date"].month <= 9]
            apr_oct = [d for d in year_days if 4 <= d["date"].month <= 10]
            apr_may = [d for d in year_days if 4 <= d["date"].month <= 5]
            jul_aug = [d for d in year_days if 7 <= d["date"].month <= 8]
            sep = [d for d in year_days if d["date"].month == 9]

            coverage_days = len([d for d in apr_oct if d.get("t_mean_c") is not None or d.get("precip_mm") is not None])
            expected = expected_days_for_window(year, 4, 10)
            coverage = coverage_days / expected if expected else 0

            growing_temp = mean(d.get("t_mean_c") for d in apr_sep)
            gdd_values = [max(0.0, d["t_mean_c"] - 10.0) for d in apr_oct if d.get("t_mean_c") is not None]
            gdd = sum(gdd_values) if gdd_values else None
            days_above_30 = count_days(apr_oct, "t_max_c", lambda value: value > 30.0)
            days_above_35 = count_days(apr_oct, "t_max_c", lambda value: value > 35.0)
            spring_frost = count_days(apr_may, "t_min_c", lambda value: value < 0.0)
            rain_apr_sep = total(d.get("precip_mm") for d in apr_sep)
            rain_jul_aug = total(d.get("precip_mm") for d in jul_aug)
            rain_sep = total(d.get("precip_mm") for d in sep)
            dry_spell = longest_dry_spell(apr_sep)
            rainy_sep_days = count_days(sep, "precip_mm", lambda value: value >= 1.0)

            heat_component = min(days_above_30 / 30.0, 1.0) * 40.0
            low_summer_rain_component = 0.0
            if rain_jul_aug is not None:
                low_summer_rain_component = max(0.0, min((120.0 - rain_jul_aug) / 120.0, 1.0)) * 35.0
            dry_component = min(dry_spell / 30.0, 1.0) * 25.0
            water_stress = max(0.0, min(100.0, heat_component + low_summer_rain_component + dry_component))

            sep_rain_component = min((rain_sep or 0.0) / 120.0, 1.0) * 70.0
            sep_days_component = min(rainy_sep_days / 15.0, 1.0) * 30.0
            harvest_risk = max(0.0, min(100.0, sep_rain_component + sep_days_component))

            rows.append(
                {
                    "region_id": region_id,
                    "vintage_year": year,
                    "growing_season_temp_c": round_or_none(growing_temp, 2),
                    "gdd": round_or_none(gdd, 1),
                    "days_above_30": days_above_30,
                    "days_above_35": days_above_35,
                    "spring_frost_days": spring_frost,
                    "rain_apr_sep_mm": round_or_none(rain_apr_sep, 1),
                    "rain_jul_aug_mm": round_or_none(rain_jul_aug, 1),
                    "rain_sep_mm": round_or_none(rain_sep, 1),
                    "longest_dry_spell_days": dry_spell,
                    "water_stress_index": round_or_none(water_stress, 0),
                    "harvest_rain_risk_index": round_or_none(harvest_risk, 0),
                    "monthly": build_monthly(year_days),
                    "coverage": coverage,
                }
            )
    return rows


def median(values: List[float]) -> Optional[float]:
    if not values:
        return None
    values = sorted(values)
    mid = len(values) // 2
    if len(values) % 2:
        return values[mid]
    return (values[mid - 1] + values[mid]) / 2.0


def add_flags_and_summary(rows: List[Dict[str, Any]]) -> None:
    temps_by_region: Dict[str, List[float]] = defaultdict(list)
    rain_by_region: Dict[str, List[float]] = defaultdict(list)
    for row in rows:
        if row.get("growing_season_temp_c") is not None:
            temps_by_region[row["region_id"]].append(float(row["growing_season_temp_c"]))
        if row.get("rain_apr_sep_mm") is not None:
            rain_by_region[row["region_id"]].append(float(row["rain_apr_sep_mm"]))

    temp_medians = {region: median(values) for region, values in temps_by_region.items()}
    rain_medians = {region: median(values) for region, values in rain_by_region.items()}

    for row in rows:
        region_id = row["region_id"]
        temp_med = temp_medians.get(region_id)
        rain_med = rain_medians.get(region_id)
        growing_temp = row.get("growing_season_temp_c")
        rain_apr_sep = row.get("rain_apr_sep_mm")
        flags = {
            "solaire": bool(temp_med is not None and growing_temp is not None and growing_temp >= temp_med + 0.6),
            "frais": bool(temp_med is not None and growing_temp is not None and growing_temp <= temp_med - 0.6),
            "sec": bool(rain_med is not None and rain_apr_sep is not None and rain_apr_sep <= rain_med * 0.85),
            "pluvieux": bool(rain_med is not None and rain_apr_sep is not None and rain_apr_sep >= rain_med * 1.15),
            "stressHydrique": bool((row.get("water_stress_index") or 0) >= 60),
            "risquePluieVendanges": bool((row.get("rain_sep_mm") or 0) >= 80),
            "gelPrintemps": bool((row.get("spring_frost_days") or 0) >= 3),
            "forteChaleur": bool((row.get("days_above_35") or 0) >= 4 or (row.get("days_above_30") or 0) >= 18),
        }
        labels = []
        if flags["solaire"]:
            labels.append("solaire")
        if flags["frais"]:
            labels.append("frais")
        if flags["sec"]:
            labels.append("sec")
        if flags["pluvieux"]:
            labels.append("pluvieux")
        if flags["stressHydrique"]:
            labels.append("stress hydrique probable")
        if flags["risquePluieVendanges"]:
            labels.append("risque pluie vendanges")
        if flags["gelPrintemps"]:
            labels.append("gel de printemps")
        if flags["forteChaleur"]:
            labels.append("forte chaleur")
        profile = ", ".join(labels) if labels else "profil proche de la normale regionale"
        region_name = REGION_NAMES.get(region_id, region_id)
        row["flags"] = flags
        row["summary"] = f"{region_name} {row['vintage_year']} : {profile}, calcule a partir des observations quotidiennes Meteo-France."
        coverage = float(row.get("coverage") or 0.0)
        row["confidence"] = round(max(0.55, min(0.95, 0.55 + 0.40 * coverage)), 2)


def write_weather_stations(path: Path, stations: Dict[str, StationInfo]) -> None:
    with atomic_csv_writer(path, WEATHER_STATION_COLUMNS) as writer:
        for station_id in sorted(stations):
            station = stations[station_id]
            writer.writerow(
                {
                    "id": station.station_id,
                    "name": station.name,
                    "latitude": fmt(station.latitude, 6),
                    "longitude": fmt(station.longitude, 6),
                    "altitude_m": fmt(station.altitude_m, 1),
                    "source_type": SOURCE_TYPE,
                    "department": station.department or "",
                }
            )


def write_weather_stations_staging(path: Path, stations: Dict[str, StationInfo]) -> None:
    with atomic_csv_writer(path, WEATHER_STATION_STAGING_COLUMNS) as writer:
        for station_id in sorted(stations):
            station = stations[station_id]
            location_wkt = ""
            if station.longitude is not None and station.latitude is not None:
                location_wkt = f"SRID=4326;POINT({fmt(station.longitude, 6)} {fmt(station.latitude, 6)})"
            writer.writerow(
                {
                    "id": station.station_id,
                    "name": station.name,
                    "elevation_m": fmt(station.altitude_m, 1),
                    "location_wkt": location_wkt,
                    "source_type": SOURCE_TYPE,
                    "department": station.department or "",
                }
            )


def write_region_stations(path: Path, region_stations: Dict[str, set[str]], station_map: Dict[str, List[Tuple[str, float]]]) -> None:
    rows: List[Dict[str, Any]] = []
    if station_map:
        for station_id, mappings in station_map.items():
            for region_id, weight in mappings:
                rows.append({"region_id": region_id, "station_id": station_id, "weight": weight})
    else:
        for region_id, station_ids in sorted(region_stations.items()):
            if not station_ids:
                continue
            weight = 1.0 / len(station_ids)
            for station_id in sorted(station_ids):
                rows.append({"region_id": region_id, "station_id": station_id, "weight": weight})

    with atomic_csv_writer(path, REGION_STATION_COLUMNS) as writer:
        for row in rows:
            writer.writerow({"region_id": row["region_id"], "station_id": row["station_id"], "weight": fmt(float(row["weight"]), 6)})


def write_region_climate(path: Path, rows: List[Dict[str, Any]]) -> None:
    add_flags_and_summary(rows)
    with atomic_csv_writer(path, REGION_CLIMATE_COLUMNS) as writer:
        for row in sorted(rows, key=lambda item: (item["region_id"], item["vintage_year"])):
            out = {column: row.get(column, "") for column in REGION_CLIMATE_COLUMNS}
            out["flags"] = json.dumps(row.get("flags", {}), ensure_ascii=False, separators=(",", ":"))
            out["monthly"] = json.dumps(row.get("monthly", []), ensure_ascii=False, separators=(",", ":"))
            out["source_type"] = SOURCE_TYPE
            writer.writerow(out)


def main() -> int:
    args = parse_args()
    regions = split_csv_arg(args.regions)
    unknown_regions = [region for region in regions if region not in REGION_DEPARTMENTS]
    if unknown_regions:
        raise SystemExit(f"Unknown region ids: {', '.join(unknown_regions)}")

    if args.departments:
        departments = [normalize_department(dep) for dep in split_csv_arg(args.departments)]
    else:
        deps = []
        for region in regions:
            deps.extend(REGION_DEPARTMENTS[region])
        departments = sorted({normalize_department(dep) for dep in deps})

    start_date = dt.date(args.start_year, 1, 1)
    end_date = dt.date(args.end_year, 12, 31)
    out_dir = Path(args.out_dir)
    raw_dir = out_dir / "raw"
    out_dir.mkdir(parents=True, exist_ok=True)

    accepted_quality = set(split_csv_arg(args.accepted_quality))
    station_map = load_station_map(args.station_map)
    dep_to_regions = department_regions(regions)

    print(f"Regions: {', '.join(regions)}", file=sys.stderr)
    print(f"Departments: {', '.join(departments)}", file=sys.stderr)
    stations: Dict[str, StationInfo] = {}
    if args.transform_only:
        raw_inputs = raw_resources_from_dir(raw_dir)
        if not raw_inputs:
            raise SystemExit(f"No raw files found in {raw_dir}")
        print(f"Raw files found: {len(raw_inputs)}", file=sys.stderr)
    else:
        resources = resolve_resources(args.url, departments, args.start_year, args.end_year)
        if not resources:
            raise SystemExit("No Meteo-France RR-T-Vent resources matched the requested departments/years.")
        print(f"Resources matched: {len(resources)}", file=sys.stderr)
        raw_inputs = download_raw(resources, raw_dir, force=args.force)

    if not raw_inputs:
        raise SystemExit("No raw Meteo-France files available to transform.")

    total_rows = build_project_csvs(
        raw_inputs=raw_inputs,
        out_dir=out_dir,
        start_date=start_date,
        end_date=end_date,
        accepted_quality=accepted_quality,
        stations=stations,
        station_map=station_map,
        dep_to_regions=dep_to_regions,
        regions=regions,
        start_year=args.start_year,
        end_year=args.end_year,
        skip_region_climate=args.skip_region_climate,
    )

    validate_outputs(out_dir, args.skip_region_climate)

    print(f"Daily weather rows: {total_rows}", file=sys.stderr)
    print(f"Output directory: {out_dir}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
