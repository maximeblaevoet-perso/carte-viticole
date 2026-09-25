#!/usr/bin/env python3
"""Ingest BRGM **BD Charm-50** (géologie harmonisée au 1/50 000) into PostGIS.

Why this exists (ADR 0014): the map used to read the subsoil from BRGM's
`LITHO_1M_SIMPLIFIEE` WMS layer — the only *queryable* national layer BRGM
publishes. At 1/1 000 000 that layer is not a generalisation of the geological
map, it is a different drawing: over Alsace a single 155 km² polygon labelled
"Basaltes et rhyolites" swallows eleven grands crus that sit on Jurassic
limestone, while the Rangen de Thann — the one genuinely volcanic cru — comes
back as "Sables".

BD Charm-50 is the harmonised 1/50 000 vector map, département by département,
free to download. It is not served as a queryable API, so we ingest it and do
the point-in-polygon ourselves (`geology_at_point`, migration 0012).

The full départemental layers are far too large to keep whole (7 700 polygons
for the Haut-Rhin alone, most of them forest and plain), so each one is
**clipped to the delimited vineyard** — the dissolved INAO parcellaire of the
scope, buffered, exactly as the cadastre lieux-dits already are. Champagne has
no row in the national parcellaire export, so its GC/PC harvest communes stand
in as the mask there.

Usage:

    python scripts/ingest_bdcharm50.py --scope alsace --download        # dry-run
    python scripts/ingest_bdcharm50.py --scope all-initial --commit

`--commit` needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (see
`scripts/README.md`). Dry-run is the default and touches no network unless
`--download` is passed.
"""

from __future__ import annotations

import argparse
import json
import sys
import zipfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from urllib import error

import geopandas as gpd
from shapely.geometry import MultiPolygon, Polygon
from shapely.geometry.base import BaseGeometry

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ingest_wine_geodata import (  # noqa: E402
    _load_project_env,
    _resolve_env,
    area_ha,
    geometry_to_ewkt,
    load_champagne_communes,
    to_multipolygon,
    upsert_rows,
    validate_geometry,
)
from wine_geodata_download import (  # noqa: E402
    SCOPE_DEPARTMENTS,
    extract_zip,
    stream_download,
)

SOURCE_DATASET_ID = "brgm-bdcharm50"
DATASET_DIR = "brgm-bdcharm50"

#: Départemental archives, three-digit code: 68 → `GEO050K_HARM_068.zip`.
BDCHARM50_BASE = "https://infoterre.brgm.fr/telechargements/BDCharm50"

#: The polygon layer of the harmonised map ("Surfaces — Formations géologiques").
#: The siblings (`_L_*`, `_P_*`, `_S_SURCH_*`) carry faults, dips and overlay
#: symbols; none of them answers "what is under this point?".
FGEOL_SUFFIX = "_S_FGEOL_2154"

#: Metres of slack around the delimited vineyard. A plot on the edge of the
#: appellation must still land inside a clipped polygon, and BD Charm-50
#: boundaries are drawn at 1/50 000 (≈ 10 m of pencil width on the ground).
VINEYARD_BUFFER_M = 500

PARCELLAIRE_GLOB = "inao-parcellaire/extracted/*delim-parcellaire-aoc-shp.shp"

#: Lambert-93. The BD Charm-50 shapefiles are already in it; the INAO
#: parcellaire too. Buffering and areas are computed here, never in degrees.
CRS_L93 = 2154


def archive_url(department: str) -> str:
    """`"68"` → the BRGM download URL for that département."""
    return f"{BDCHARM50_BASE}/GEO050K_HARM_{department.zfill(3)}.zip"


def _download_archive(department: str, archive: Path) -> None:
    print(f"  download BD Charm-50 dept {department} ({archive_url(department)})")
    stream_download(archive_url(department), archive)


@dataclass
class DepartmentResult:
    department: str
    status: str  # ok | skipped | failed
    rows: int = 0
    source_polygons: int = 0
    message: str = ""


@dataclass
class IngestResult:
    departments: list[DepartmentResult] = field(default_factory=list)
    rows: list[dict[str, object]] = field(default_factory=list)

    @property
    def ok(self) -> int:
        return sum(1 for d in self.departments if d.status == "ok")

    @property
    def failed(self) -> int:
        return sum(1 for d in self.departments if d.status == "failed")


def ensure_archive(
    department: str, raw_dir: Path, *, allow_download: bool, force: bool
) -> Optional[Path]:
    """Return the extracted `_S_FGEOL_` shapefile for a département, or None.

    Downloads only when asked: like the wine geodata downloader, network access
    is opt-in so a dry-run stays offline.
    """
    out_dir = raw_dir / DATASET_DIR / department
    shp = out_dir / "extracted" / f"GEO050K_HARM_{department.zfill(3)}{FGEOL_SUFFIX}.shp"
    if shp.is_file() and not force:
        return shp

    if not allow_download:
        return None

    out_dir.mkdir(parents=True, exist_ok=True)
    archive = out_dir / f"GEO050K_HARM_{department.zfill(3)}.zip"
    if not archive.is_file() or force:
        _download_archive(department, archive)

    try:
        extracted = extract_zip(archive, out_dir / "extracted")
    except zipfile.BadZipFile:
        # InfoTerre serves these at ~150 KB/s and truncates the stream often
        # enough to be worth one retry: a half-written archive is indis-
        # tinguishable from a present one on the next run otherwise.
        print(f"  ! dept {department}: truncated archive, re-downloading")
        archive.unlink(missing_ok=True)
        _download_archive(department, archive)
        extracted = extract_zip(archive, out_dir / "extracted")

    for candidate in extracted:
        if FGEOL_SUFFIX in candidate.name:
            return candidate
    # Some départements ship the polygon layer under a slightly different stem;
    # fall back to the largest shapefile rather than guessing silently.
    return shp if shp.is_file() else (extracted[0] if extracted else None)


def _parcellaire_clip(
    raw_dir: Path, departments: tuple[str, ...]
) -> Optional[BaseGeometry]:
    """Dissolved INAO parcellaire for the scope, in Lambert-93."""
    matches = sorted(raw_dir.glob(PARCELLAIRE_GLOB))
    if not matches:
        return None

    parcels = gpd.read_file(matches[-1])
    if parcels.empty:
        return None

    in_scope = parcels[
        parcels["insee"].astype(str).str.zfill(5).str[:2].isin(departments)
    ]
    if in_scope.empty:
        return None
    return in_scope.to_crs(CRS_L93).geometry.union_all()


def _champagne_commune_clip(
    raw_dir: Path, departments: tuple[str, ...]
) -> Optional[BaseGeometry]:
    """Footprint of the Champagne Grand Cru / Premier Cru harvest communes.

    The national INAO parcellaire export carries **no Champagne row** (see
    `scripts/README.md`), so there is no delimited-plot mask for 08/10/51/52.
    The project already models Champagne by commune, from the same cadastre
    lieux-dits it ingests; their union per GC/PC commune is the closest
    defensible mask. It is wider than the planted vineyard — a commune is not a
    slope — but it is bounded, unlike the AOC aire géographique which covers
    some 34 000 km².
    """
    communes = {
        insee
        for insee in load_champagne_communes()
        if str(insee)[:2] in departments
    }
    if not communes:
        return None

    parts: list[BaseGeometry] = []
    for department in departments:
        path = (
            raw_dir
            / "etalab-cadastre"
            / "departements"
            / department
            / f"cadastre-{department}-lieux_dits.geojson"
        )
        if not path.is_file():
            continue
        lieux = gpd.read_file(path)
        if lieux.empty or "commune" not in lieux.columns:
            continue
        kept = lieux[lieux["commune"].astype(str).isin(communes)]
        if kept.empty:
            continue
        parts.append(kept.to_crs(CRS_L93).geometry.union_all())

    if not parts:
        return None
    return gpd.GeoSeries(parts, crs=CRS_L93).union_all()


def load_vineyard_clip(
    raw_dir: Path, departments: tuple[str, ...]
) -> Optional[BaseGeometry]:
    """The mask that keeps the ingested geology to the vineyard, in Lambert-93.

    Union of the INAO parcellaire (where it exists) and the Champagne GC/PC
    commune footprints (where it does not), buffered so that a plot on the edge
    of the appellation still lands inside a clipped polygon.

    Returns None when neither source is on disk — the caller then refuses to
    ingest whole départements by accident.
    """
    parts = [
        part
        for part in (
            _parcellaire_clip(raw_dir, departments),
            _champagne_commune_clip(raw_dir, departments),
        )
        if part is not None and not part.is_empty
    ]
    if not parts:
        return None
    return gpd.GeoSeries(parts, crs=CRS_L93).union_all().buffer(VINEYARD_BUFFER_M)


def unit_id(department: str, source_key: object) -> str:
    """Stable row id: the département plus BD Charm-50's own polygon key."""
    return f"bdcharm50-{department}-{source_key}"


def _as_polygonal(geom: BaseGeometry) -> Optional[BaseGeometry]:
    """Drop the line/point debris a clip leaves behind on shared boundaries."""
    if geom is None or geom.is_empty:
        return None
    if isinstance(geom, (Polygon, MultiPolygon)):
        return geom
    if geom.geom_type == "GeometryCollection":
        parts = [g for g in geom.geoms if isinstance(g, (Polygon, MultiPolygon))]
        if not parts:
            return None
        return MultiPolygon(
            [p for g in parts for p in (g.geoms if isinstance(g, MultiPolygon) else [g])]
        )
    return None


def build_rows(
    department: str,
    shp: Path,
    clip: BaseGeometry,
    *,
    ingested_at: str,
) -> tuple[list[dict[str, object]], int]:
    """Clip one départemental layer to the vineyard and build upsert rows."""
    units = gpd.read_file(shp)
    source_polygons = len(units)
    if units.empty:
        return [], 0

    # Clip in Lambert-93 (the mask is metric), then reproject the survivors
    # once — `area_ha` and `geometry_to_ewkt` both expect WGS84.
    clipped = gpd.clip(units.to_crs(CRS_L93), clip).to_crs(epsg=4326)

    rows: list[dict[str, object]] = []
    for _, unit in clipped.iterrows():
        geom = _as_polygonal(unit.geometry)
        if geom is None:
            continue
        geom = validate_geometry(geom)
        if geom is None:
            continue

        multi = to_multipolygon(geom)
        if multi is None:
            continue
        ewkt = geometry_to_ewkt(multi)
        if ewkt is None:
            continue
        hectares = area_ha(multi)

        notation = str(unit.get("NOTATION") or "").strip()
        descr = str(unit.get("DESCR") or "").strip()
        if not notation and not descr:
            continue

        rows.append(
            {
                "id": unit_id(department, unit.get("MI_PRINX")),
                "department": department,
                "carte": str(unit.get("CARTE") or "").strip() or None,
                "code": str(unit.get("CODE") or "").strip() or None,
                "code_leg": str(unit.get("CODE_LEG") or "").strip() or None,
                "notation": notation or None,
                "descr": descr or None,
                "area_ha": hectares,
                "geom": ewkt,
                "source_dataset_id": SOURCE_DATASET_ID,
                "source_type": "real",
                "ingested_at": ingested_at,
            }
        )
    return rows, source_polygons


def run_scope(
    scope: str,
    raw_dir: Path,
    *,
    allow_download: bool,
    force: bool,
) -> IngestResult:
    departments = SCOPE_DEPARTMENTS.get(scope, SCOPE_DEPARTMENTS["all-initial"])
    result = IngestResult()

    clip = load_vineyard_clip(raw_dir, departments)
    if clip is None:
        print(
            "! no INAO parcellaire found — run ingest_wine_geodata.py with "
            "--include-national-geo first. Refusing to ingest whole départements.",
            file=sys.stderr,
        )
        return result

    ingested_at = datetime.now(timezone.utc).isoformat()
    for department in departments:
        try:
            shp = ensure_archive(
                department, raw_dir, allow_download=allow_download, force=force
            )
        except error.URLError as exc:
            result.departments.append(
                DepartmentResult(department, "failed", message=f"download: {exc.reason}")
            )
            continue

        if shp is None:
            result.departments.append(
                DepartmentResult(
                    department, "skipped", message="not downloaded (pass --download)"
                )
            )
            continue

        rows, source_polygons = build_rows(
            department, shp, clip, ingested_at=ingested_at
        )
        result.rows.extend(rows)
        result.departments.append(
            DepartmentResult(
                department,
                "ok",
                rows=len(rows),
                source_polygons=source_polygons,
                message=f"{len(rows)} kept of {source_polygons}",
            )
        )

    return result


def print_summary(result: IngestResult) -> None:
    print(
        f"bdcharm50: departments ok={result.ok} failed={result.failed} "
        f"rows={len(result.rows)}"
    )
    for dept in result.departments:
        print(f"  [{dept.status}] {dept.department}: {dept.message}")


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--scope",
        default="all-initial",
        choices=sorted(SCOPE_DEPARTMENTS),
        help="Which départements to ingest (default: all-initial).",
    )
    parser.add_argument(
        "--raw-dir",
        default="data/raw/wine-geodata",
        help="Where raw downloads live (default: data/raw/wine-geodata).",
    )
    parser.add_argument(
        "--download",
        action="store_true",
        help="Allow downloading the BD Charm-50 archives (~15–36 MB each).",
    )
    parser.add_argument(
        "--force-download",
        action="store_true",
        help="Re-download even when the archive is already present.",
    )
    parser.add_argument(
        "--batch-size", type=int, default=200, help="Upsert batch size."
    )
    parser.add_argument(
        "--out",
        help="Write the built rows to this JSON file (geometry as EWKT).",
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--commit", action="store_true", help="Write to Supabase.")
    mode.add_argument("--dry-run", action="store_true", help="Force dry-run (default).")
    args = parser.parse_args(argv)

    raw_dir = Path(args.raw_dir)
    result = run_scope(
        args.scope,
        raw_dir,
        allow_download=args.download or args.force_download,
        force=args.force_download,
    )
    print_summary(result)

    if args.out:
        Path(args.out).write_text(
            json.dumps(result.rows, ensure_ascii=False), encoding="utf-8"
        )
        print(f"rows written to {args.out}")

    if not args.commit:
        print("dry-run: nothing written (pass --commit to upsert).")
        return 0 if result.failed == 0 else 1

    _load_project_env()
    supabase_url, service_key = _resolve_env()
    if not supabase_url or not service_key:
        print(
            "! --commit needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
            file=sys.stderr,
        )
        return 1

    written, errors = upsert_rows(
        "geology_units",
        "id",
        result.rows,
        supabase_url,
        service_key,
        args.batch_size,
    )
    print(f"geology_units: written={written} errors={errors}")
    return 0 if errors == 0 and result.failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
