#!/usr/bin/env python3
"""Import Météo-France daily CSV files into `daily_weather`.

Expected input:
    - semicolon-separated CSV
    - daily rows with columns NUM_POSTE, AAAAMMJJ, TX, TN, TM, RR

The importer runs in dry-run mode by default. Use `--commit` to write to
Supabase with the service role key.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from dataclasses import dataclass
from datetime import date, datetime
from typing import Iterable, Optional
from urllib import error, request

from dotenv import load_dotenv

CSV_DELIMITER = ";"
BATCH_SIZE = 500


@dataclass
class DailyRow:
    station_id: str
    obs_date: date
    t_min_c: Optional[float]
    t_max_c: Optional[float]
    t_mean_c: Optional[float]
    precip_mm: Optional[float]
    source_type: str = "real"

    def to_payload(self) -> dict[str, object]:
        payload: dict[str, object] = {
            "station_id": self.station_id,
            "obs_date": self.obs_date.isoformat(),
            "source_type": self.source_type,
        }
        if self.t_min_c is not None:
            payload["t_min_c"] = self.t_min_c
        if self.t_max_c is not None:
            payload["t_max_c"] = self.t_max_c
        if self.t_mean_c is not None:
            payload["t_mean_c"] = self.t_mean_c
        if self.precip_mm is not None:
            payload["precip_mm"] = self.precip_mm
        return payload


def _to_float(raw: Optional[str]) -> Optional[float]:
    if raw is None:
        return None
    raw = raw.strip().replace("\xa0", "").replace("\u202f", "")
    if raw == "" or raw.lower() in {"nan", "na", "mq", "m", "nd"}:
        return None
    raw = raw.replace(" ", "").replace(",", ".")
    try:
        return float(raw)
    except ValueError:
        return None


def _clean_text(raw: Optional[str]) -> Optional[str]:
    if raw is None:
        return None
    cleaned = raw.strip().replace("\xa0", "").replace("\u202f", "")
    return cleaned or None


def _parse_date(raw: str) -> date:
    raw = _clean_text(raw)
    if raw is None:
        raise ValueError("Missing date")
    # Météo-France daily files: YYYYMMDD. Fall back to ISO if needed.
    for fmt in ("%Y%m%d", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Unrecognised date format: {raw!r}")


def parse_csv(path: str) -> tuple[list[DailyRow], int, int]:
    """Return parsed rows, total data lines read, and ignored lines."""
    rows: list[DailyRow] = []
    read_count = 0
    ignored_count = 0

    with open(path, newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh, delimiter=CSV_DELIMITER)
        if reader.fieldnames is None:
            raise ValueError("Empty CSV (no header row).")

        required_columns = {"NUM_POSTE", "AAAAMMJJ"}
        missing = sorted(required_columns - set(reader.fieldnames))
        if missing:
            raise ValueError(f"Missing required columns: {', '.join(missing)}")

        for row in reader:
            read_count += 1
            station_id = _clean_text(row.get("NUM_POSTE"))
            date_raw = row.get("AAAAMMJJ")
            if station_id is None or date_raw is None:
                ignored_count += 1
                continue

            try:
                obs_date = _parse_date(date_raw)
            except ValueError:
                ignored_count += 1
                continue

            rows.append(
                DailyRow(
                    station_id=station_id,
                    obs_date=obs_date,
                    t_min_c=_to_float(row.get("TN")),
                    t_max_c=_to_float(row.get("TX")),
                    t_mean_c=_to_float(row.get("TM")),
                    precip_mm=_to_float(row.get("RR")),
                    source_type="real",
                )
            )

    return rows, read_count, ignored_count


def _chunked(items: Iterable[DailyRow], size: int) -> Iterable[list[DailyRow]]:
    batch: list[DailyRow] = []
    for item in items:
        batch.append(item)
        if len(batch) >= size:
            yield batch
            batch = []
    if batch:
        yield batch


def upsert_rows(rows: Iterable[DailyRow], supabase_url: str, service_key: str) -> int:
    """Upsert rows into Supabase via the PostgREST API."""
    endpoint = supabase_url.rstrip("/") + "/rest/v1/daily_weather?on_conflict=station_id,obs_date"
    headers = {
        "apikey": service_key,
        "authorization": f"Bearer {service_key}",
        "content-type": "application/json",
        "accept": "application/json",
        "prefer": "resolution=merge-duplicates,return=minimal",
    }

    count = 0
    for batch in _chunked(rows, BATCH_SIZE):
        payload = [row.to_payload() for row in batch]
        req = request.Request(
            endpoint,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        try:
            with request.urlopen(req) as resp:
                resp.read()
        except error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(
                f"Supabase upsert failed ({exc.code}): {body or exc.reason}"
            ) from exc
        count += len(batch)

    return count


def main(argv: Optional[list[str]] = None) -> int:
    load_dotenv()

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", required=True, help="Path to the Météo-France CSV file.")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--commit", action="store_true", help="Actually write to Supabase.")
    mode.add_argument("--dry-run", action="store_true", help="Force dry-run mode.")
    args = parser.parse_args(argv)

    rows, read_count, ignored_count = parse_csv(args.csv)

    if not args.commit:
        print(
            f"mode=dry-run lues={read_count} ignorées={ignored_count} upsertées={len(rows)}"
        )
        return 0

    supabase_url = os.environ.get("SUPABASE_URL")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_key:
        print(
            "ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.",
            file=sys.stderr,
        )
        return 1

    written = upsert_rows(rows, supabase_url, service_key)
    print(f"mode=commit lues={read_count} ignorées={ignored_count} upsertées={written}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
