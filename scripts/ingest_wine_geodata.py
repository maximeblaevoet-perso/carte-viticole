#!/usr/bin/env python3
"""Ingest French wine geodata (INAO, Etalab cadastre, IGN RPG) into Supabase/PostGIS.

Reads shapefiles/GeoJSON from ``data/raw/wine-geodata`` (or downloads via
``scripts/wine_geodata_download.py`` when ``--allow-download`` is set).
Dry-run by default: parses, inspects columns, normalises slugs, and reports
counts without writing.

Download examples::

    # CSV + cadastre par département (léger, ~20 Mo/dept)
    python scripts/ingest_wine_geodata.py --allow-download --download-only --scope champagne

    # + archives INAO nationales shapefile (~90 + ~270 Mo)
    python scripts/ingest_wine_geodata.py --allow-download --include-national-geo --download-only --scope all-initial

Ingest examples::

Imported rows are always ``source_type=real``. The script refuses to silently
overwrite existing ``synthetic`` rows (use ``--allow-overwrite-synthetic``).

Initial scope: Alsace (51 Grands Crus + parcellaire), Champagne (GC/PC communes
+ parcellaire + lieux-dits). Bourgogne structure is reserved for later.

Examples::

    # Offline dry-run on bundled fixtures (no network, no Supabase write)
    python scripts/ingest_wine_geodata.py --fixture-dir scripts/fixtures/wine-geodata --scope all-initial

    # Dry-run on local raw files
    python scripts/ingest_wine_geodata.py --skip-download --scope alsace

    # Real import (requires .env + explicit flags)
    python scripts/ingest_wine_geodata.py --scope champagne --skip-download --commit
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import unicodedata
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator, Optional
from urllib import error, parse, request

from dotenv import load_dotenv

try:
    import geopandas as gpd
    from shapely import make_valid
    from shapely.geometry import MultiPolygon, Point
    from shapely.geometry.base import BaseGeometry
except ImportError as exc:  # pragma: no cover - env guard
    print(
        "ERROR: geopandas and shapely are required. "
        "Run: pip install -r scripts/requirements.txt",
        file=sys.stderr,
    )
    raise SystemExit(1) from exc

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
SOURCE_TYPE = "real"
DEFAULT_RAW_DIR = os.path.join("data", "raw", "wine-geodata")
DEFAULT_BATCH_SIZE = 200
SCRIPT_DIR = Path(__file__).resolve().parent
CHAMPAGNE_COMMUNES_PATH = SCRIPT_DIR / "data" / "champagne-gc-pc-communes.json"

ALSACE_DEPT_PREFIXES = ("67", "68")
CHAMPAGNE_DEPT_PREFIXES = ("08", "10", "51", "52")

# Rows in source_datasets seeded by migrations (ingest only bumps source_updated_at).
CATALOG_DATASET_IDS = (
    "inao-siqo",
    "inao-aires-aop-igp",
    "inao-aires-geo",
    "inao-parcellaire",
    "ign-rpg",
    "etalab-cadastre",
)

# Level-1 wine_areas mirror wine_regions ids (see docs/data-model.md).
ROOT_WINE_AREAS: dict[str, dict[str, object]] = {
    "champagne": {
        "id": "champagne",
        "name": "Champagne",
        "level": 1,
        "parent_id": None,
        "root_region_id": "champagne",
        "region_type": "region",
        "zoom_min": 5,
        "zoom_max": 22,
        "available_data_scopes": [],
        "provisional": False,
    },
    "alsace": {
        "id": "alsace",
        "name": "Alsace",
        "level": 1,
        "parent_id": None,
        "root_region_id": "alsace",
        "region_type": "region",
        "zoom_min": 5,
        "zoom_max": 22,
        "available_data_scopes": [],
        "provisional": False,
    },
    "alsace-grand-cru": {
        "id": "alsace-grand-cru",
        "name": "Alsace Grand Cru",
        "level": 2,
        "parent_id": "alsace",
        "root_region_id": "alsace",
        "region_type": "appellation",
        "zoom_min": 8,
        "zoom_max": 22,
        "available_data_scopes": [],
        "provisional": False,
    },
}

# data.gouv.fr dataset slugs — geometry vs tabular split (see wine_geodata_download).
DATASET_SLUGS = {
    "inao-siqo": (
        "referentiel-des-produits-sous-signe-officiel-didentification-de-la-"
        "qualite-et-de-lorigine-siqo"
    ),
    "inao-aires-produits": "aires-et-produits-aoc-aop-et-igp",
    "inao-aires-geo": "delimitation-des-aires-geographiques-des-siqo",
    "inao-parcellaire": "delimitation-parcellaire-des-aoc-viticoles-de-linao",
}

# Expected local filenames after download/extract (first match wins).
LOCAL_FILE_CANDIDATES: dict[str, list[str]] = {
    "inao-aires-geo": [
        "inao-aires-geo/extracted/*.shp",
        "inao-aires-geo/**/*.shp",
    ],
    "inao-parcellaire": [
        "inao-parcellaire/extracted/*.shp",
        "inao-parcellaire/**/*.shp",
        "alsace-parcellaire-sample.geojson",
        "champagne-parcellaire-sample.geojson",
    ],
    "etalab-cadastre": [
        "etalab-cadastre/departements/*/cadastre-*-lieux_dits.geojson",
        "etalab-cadastre/communes/*/lieux_dits.geojson",
        "cadastre-lieux-dits-sample.geojson",
    ],
}

COLUMN_ALIASES: dict[str, tuple[str, ...]] = {
    "id_app": ("id_app", "idapp", "id_appellation"),
    "app": ("app", "appellation", "nom_app"),
    "id_denom": ("id_denom", "iddenom", "id_denomination"),
    "denom": ("denom", "denomination", "nom_denom"),
    "type_denom": ("type_denom", "type_denomination", "typedenom"),
    "type_prod": ("type_prod", "type_produit", "typeprod"),
    "signe": ("signe", "sigle"),
    "insee": ("insee", "code_insee", "insee_com", "insee_commune", "commune"),
    "nomcom": ("nomcom", "nom_com", "nom_commune", "commune"),
    "id_aire": ("id_aire", "idaire", "id_parcelle"),
    "lieudit": ("lieudit", "lieu_dit", "nom_ld", "nom_lieudit", "nom"),
    "section": ("section", "sec"),
    "numero": ("numero", "num", "numero_parcelle"),
}

PROVENANCE: dict[str, dict[str, object]] = {
    "inao-aires-geo": {
        "license": "Licence Ouverte / Etalab",
        "attribution": "INAO — data.gouv.fr",
        "is_official": False,
        "is_informative": True,
    },
    "inao-parcellaire": {
        "license": "Licence Ouverte / Etalab",
        "attribution": "INAO — data.gouv.fr",
        "is_official": False,
        "is_informative": True,
    },
    "etalab-cadastre": {
        "license": "Licence Ouverte / Etalab",
        "attribution": "DGFiP — Etalab",
        "is_official": False,
        "is_informative": True,
    },
}


# ---------------------------------------------------------------------------
# Stats / ingest bundle
# ---------------------------------------------------------------------------
@dataclass
class IngestStats:
    read: int = 0
    kept: int = 0
    skipped: int = 0
    errors: int = 0


@dataclass
class IngestBundle:
    source_datasets: list[dict[str, object]] = field(default_factory=list)
    wine_areas: list[dict[str, object]] = field(default_factory=list)
    wine_parcels: list[dict[str, object]] = field(default_factory=list)
    wine_area_parcels: list[dict[str, object]] = field(default_factory=list)
    wine_lieux_dits: list[dict[str, object]] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Text / slug helpers
# ---------------------------------------------------------------------------
def _ascii_fold(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", text)
    return "".join(c for c in normalized if not unicodedata.combining(c))


def slugify(text: str, max_len: int = 80) -> str:
    """Stable URL slug from a French label."""
    folded = _ascii_fold(str(text or "")).lower()
    folded = re.sub(r"[^a-z0-9]+", "-", folded).strip("-")
    return (folded[:max_len] or "unknown").strip("-")


def stable_hash(*parts: object, length: int = 20) -> str:
    payload = "|".join(str(p or "") for p in parts)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:length]


def stable_parcel_id(
    source_dataset_id: str,
    geometry_wkt: str,
    id_app: Optional[str],
    id_denom: Optional[str],
    insee: Optional[str],
    id_aire: Optional[str] = None,
) -> str:
    """Stable parcel id when cadastral ref is absent in INAO shapefile."""
    geom_hash = hashlib.sha256(geometry_wkt.encode("utf-8")).hexdigest()[:12]
    digest = stable_hash(
        source_dataset_id, id_app, id_denom, insee, id_aire, geom_hash, length=16
    )
    return f"parcel-{digest}"


# ---------------------------------------------------------------------------
# Column inspection / normalisation
# ---------------------------------------------------------------------------
def normalise_column_name(name: str) -> str:
    folded = _ascii_fold(name).lower()
    return re.sub(r"[^a-z0-9]+", "_", folded).strip("_")


def build_column_map(columns: list[str]) -> dict[str, str]:
    """Map canonical field names to actual dataframe columns."""
    norm_to_actual = {normalise_column_name(c): c for c in columns}
    mapping: dict[str, str] = {}
    for canonical, aliases in COLUMN_ALIASES.items():
        for alias in aliases:
            actual = norm_to_actual.get(normalise_column_name(alias))
            if actual:
                mapping[canonical] = actual
                break
    return mapping


def inspect_columns(gdf: gpd.GeoDataFrame, label: str) -> dict[str, str]:
    col_map = build_column_map(list(gdf.columns))
    print(f"  columns[{label}]: raw={list(gdf.columns)}")
    print(f"  columns[{label}]: mapped={col_map}")
    return col_map


def row_value(row: Any, col_map: dict[str, str], key: str) -> Optional[str]:
    col = col_map.get(key)
    if not col:
        return None
    raw = row.get(col)
    if raw is None:
        return None
    text = str(raw).strip()
    return text or None


# ---------------------------------------------------------------------------
# Geometry helpers (EPSG:4326, valid MultiPolygon)
# ---------------------------------------------------------------------------
def ensure_srid_4326(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    if gdf.crs is None:
        # INAO national exports are often Lambert-93; fixtures are WGS84.
        # Caller should set crs when known; default WGS84 for fixture safety.
        gdf = gdf.set_crs(epsg=4326)
    elif gdf.crs.to_epsg() != 4326:
        gdf = gdf.to_crs(epsg=4326)
    return gdf


def validate_geometry(geom: BaseGeometry) -> Optional[BaseGeometry]:
    if geom is None or geom.is_empty:
        return None
    fixed = make_valid(geom)
    if fixed.is_empty:
        return None
    return fixed


def to_multipolygon(geom: BaseGeometry) -> Optional[MultiPolygon]:
    geom = validate_geometry(geom)
    if geom is None:
        return None
    if isinstance(geom, MultiPolygon):
        return geom
    if geom.geom_type == "Polygon":
        return MultiPolygon([geom])
    if geom.geom_type == "GeometryCollection":
        polys = [g for g in geom.geoms if g.geom_type in ("Polygon", "MultiPolygon")]
        if not polys:
            return None
        parts: list = []
        for g in polys:
            if g.geom_type == "Polygon":
                parts.append(g)
            else:
                parts.extend(g.geoms)
        return MultiPolygon(parts) if parts else None
    return None


def geometry_to_ewkt(geom: BaseGeometry, kind: str = "multipolygon") -> Optional[str]:
    from shapely import wkt as shapely_wkt

    if kind == "multipolygon":
        mp = to_multipolygon(geom)
        if mp is None:
            return None
        return f"SRID=4326;{shapely_wkt.dumps(mp)}"
    if kind == "point":
        pt = geom if isinstance(geom, Point) else geom.representative_point()
        return f"SRID=4326;{shapely_wkt.dumps(pt)}"
    return None


def centroid_lon_lat(geom: BaseGeometry) -> Optional[tuple[float, float]]:
    mp = to_multipolygon(geom)
    if mp is None:
        return None
    pt = mp.representative_point()
    return (float(pt.x), float(pt.y))


def area_ha(geom: BaseGeometry) -> Optional[float]:
    """Rough area in hectares using equal-area reprojection."""
    mp = to_multipolygon(geom)
    if mp is None:
        return None
    try:
        gseries = gpd.GeoSeries([mp], crs="EPSG:4326").to_crs(epsg=2154)
        return round(float(gseries.area.iloc[0]) / 10_000, 4)
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Scope filters
# ---------------------------------------------------------------------------
def insee_in_scope(insee: Optional[str], scope: str) -> bool:
    if not insee or len(insee) < 2:
        return False
    dept = insee[:2]
    if scope == "alsace":
        return dept in ALSACE_DEPT_PREFIXES
    if scope == "champagne":
        return dept in CHAMPAGNE_DEPT_PREFIXES
    return False


def appellation_in_scope(app: Optional[str], denom: Optional[str], scope: str) -> bool:
    text = f"{app or ''} {denom or ''}".lower()
    if scope == "alsace":
        return "alsace" in text or "cremant" in text
    if scope == "champagne":
        return "champagne" in text
    return False


def row_in_scope(
    row: Any,
    col_map: dict[str, str],
    scope: str,
) -> bool:
    insee = row_value(row, col_map, "insee")
    if insee_in_scope(insee, scope):
        return True
    return appellation_in_scope(
        row_value(row, col_map, "app"),
        row_value(row, col_map, "denom"),
        scope,
    )


# ---------------------------------------------------------------------------
# File I/O
# ---------------------------------------------------------------------------
def load_geodata(path: Path) -> gpd.GeoDataFrame:
    gdf = gpd.read_file(path)
    return ensure_srid_4326(gdf)


def resolve_local_path(raw_dir: Path, dataset_id: str) -> Optional[Path]:
    for rel in LOCAL_FILE_CANDIDATES.get(dataset_id, []):
        if "*" in rel:
            parent = raw_dir / Path(rel).parent
            if parent.exists():
                matches = sorted(raw_dir.glob(rel))
                if matches:
                    return matches[0]
            continue
        candidate = raw_dir / rel
        if candidate.is_file():
            return candidate
    sub = raw_dir / dataset_id
    if sub.is_dir():
        for pattern in ("**/*.shp", "**/*.geojson"):
            matches = sorted(sub.glob(pattern))
            if matches:
                return matches[0]
    return None


def resolve_cadastre_lieux_dits(raw_dir: Path, scope: str) -> list[Path]:
    """Collect cadastre lieux-dits GeoJSON for scope departments."""
    from wine_geodata_download import SCOPE_DEPARTMENTS

    paths: list[Path] = []
    depts = SCOPE_DEPARTMENTS.get(scope, SCOPE_DEPARTMENTS["all-initial"])
    for dept in depts:
        p = (
            raw_dir
            / "etalab-cadastre"
            / "departements"
            / dept
            / f"cadastre-{dept}-lieux_dits.geojson"
        )
        if p.is_file():
            paths.append(p)
    communes_dir = raw_dir / "etalab-cadastre" / "communes"
    if communes_dir.is_dir():
        for p in sorted(communes_dir.glob("*/lieux_dits.geojson")):
            paths.append(p)
    return paths


def run_download_phase(
    raw_dir: Path,
    scope: str,
    *,
    include_national_geo: bool,
    cadastre_mode: str,
    force: bool,
) -> int:
    from wine_geodata_download import download_all, print_summary

    communes: list[str] = []
    if cadastre_mode == "commune" and scope in ("champagne", "all-initial"):
        communes = sorted(load_champagne_communes().keys())

    print(f"download phase: scope={scope} national_geo={include_national_geo}")
    summary = download_all(
        raw_dir,
        scope=scope,
        include_national_geo=include_national_geo,
        cadastre_mode=cadastre_mode,
        champagne_communes=communes or None,
        force=force,
    )
    print_summary(summary)
    return 1 if summary.failed else 0


def ensure_dataset_file(
    dataset_id: str,
    raw_dir: Path,
    *,
    skip_download: bool,
    allow_download: bool,
    fixture_dir: Optional[Path],
    include_national_geo: bool = False,
    force_download: bool = False,
) -> Optional[Path]:
    path = resolve_local_path(raw_dir, dataset_id)
    if path:
        return path
    if fixture_dir:
        fixture_names = {
            "inao-aires-geo": "alsace-aires-sample.geojson",
            "inao-parcellaire": None,
            "etalab-cadastre": "cadastre-lieux-dits-sample.geojson",
        }
        name = fixture_names.get(dataset_id)
        if name:
            fix = fixture_dir / name
            if fix.is_file():
                return fix
    if skip_download or not allow_download:
        if skip_download:
            print(f"  missing local file for {dataset_id} (--skip-download)")
        else:
            print(
                f"  missing local file for {dataset_id}; "
                "pass --allow-download or place files under --raw-dir"
            )
        return None

    from wine_geodata_download import DATA_GOUV_DATASETS, download_datagouv_dataset

    ds = DATA_GOUV_DATASETS.get(dataset_id)
    if not ds:
        print(f"  no download config for {dataset_id}")
        return None
    result = download_datagouv_dataset(
        ds,
        raw_dir,
        include_national_geo=include_national_geo,
        force=force_download,
    )
    if result.status != "ok":
        print(f"  download failed for {dataset_id}: {result.message}")
        return None
    return resolve_local_path(raw_dir, dataset_id) or result.path


# ---------------------------------------------------------------------------
# Champagne commune reference
# ---------------------------------------------------------------------------
def load_champagne_communes() -> dict[str, dict[str, str]]:
    with CHAMPAGNE_COMMUNES_PATH.open(encoding="utf-8") as fh:
        data = json.load(fh)
    by_insee: dict[str, dict[str, str]] = {}
    for cru_type in ("grand_cru", "premier_cru"):
        for entry in data.get(cru_type, []):
            insee = entry["insee"]
            by_insee[insee] = {
                "name": entry["name"],
                "region_type": "grand-cru" if cru_type == "grand_cru" else "premier-cru",
            }
    return by_insee


# ---------------------------------------------------------------------------
# Processors
# ---------------------------------------------------------------------------
def provenance_fields(source_dataset_id: str) -> dict[str, object]:
    base = PROVENANCE.get(source_dataset_id, {})
    return {
        "source_dataset_id": source_dataset_id,
        "source_type": SOURCE_TYPE,
        "is_official": base.get("is_official", False),
        "is_informative": base.get("is_informative", True),
        "license": base.get("license"),
        "attribution": base.get("attribution"),
        "source_updated_at": datetime.now(timezone.utc).isoformat(),
    }


def link_provenance_fields(source_dataset_id: str) -> dict[str, object]:
    """Provenance columns allowed on junction tables (wine_area_parcels)."""
    return {
        "source_dataset_id": source_dataset_id,
        "source_type": SOURCE_TYPE,
    }


def process_alsace_aires(
    gdf: gpd.GeoDataFrame,
    stats: IngestStats,
    bundle: IngestBundle,
) -> None:
    ensure_root_wine_areas(bundle, "alsace", "alsace-grand-cru")
    col_map = inspect_columns(gdf, "alsace-aires")
    seen_areas: set[str] = set()
    for _, row in gdf.iterrows():
        stats.read += 1
        if not row_in_scope(row, col_map, "alsace"):
            stats.skipped += 1
            continue
        denom = row_value(row, col_map, "denom") or row_value(row, col_map, "app")
        type_denom = (row_value(row, col_map, "type_denom") or "").lower()
        id_denom = row_value(row, col_map, "id_denom")
        id_app = row_value(row, col_map, "id_app")
        if not denom:
            stats.errors += 1
            continue
        ewkt = geometry_to_ewkt(row.geometry)
        if not ewkt:
            stats.errors += 1
            continue
        center = centroid_lon_lat(row.geometry)
        is_grand_cru = "grand cru" in (denom or "").lower() or "grand cru" in type_denom
        region_type = "grand-cru" if is_grand_cru else "appellation"
        level = 4 if is_grand_cru else 3
        parent_id = "alsace-grand-cru" if is_grand_cru else "alsace"
        area_id = slugify(f"alsace-{denom}")
        if area_id in seen_areas:
            stats.skipped += 1
            continue
        seen_areas.add(area_id)
        payload: dict[str, object] = {
            "id": area_id,
            "name": denom,
            "level": level,
            "parent_id": parent_id,
            "root_region_id": "alsace",
            "region_type": region_type,
            "geom": ewkt,
            "zoom_min": 9.5 if is_grand_cru else 8,
            "zoom_max": 22,
            "available_data_scopes": ["soils"] if is_grand_cru else [],
            "provisional": False,
            "inao_id_app": id_app,
            "inao_id_denom": id_denom,
            "insee_commune": row_value(row, col_map, "insee"),
            **provenance_fields("inao-aires-geo"),
        }
        if center:
            payload["center"] = geometry_to_ewkt(Point(center), kind="point")
        bundle.wine_areas.append(payload)
        stats.kept += 1


def process_parcellaire(
    gdf: gpd.GeoDataFrame,
    scope: str,
    stats: IngestStats,
    bundle: IngestBundle,
    area_index: dict[str, str],
    seen_parcel_ids: Optional[set[str]] = None,
    seen_links: Optional[set[tuple[str, str]]] = None,
) -> None:
    col_map = inspect_columns(gdf, f"{scope}-parcellaire")
    if seen_parcel_ids is None:
        seen_parcel_ids = set()
    if seen_links is None:
        seen_links = set()
    for _, row in gdf.iterrows():
        stats.read += 1
        if not row_in_scope(row, col_map, scope):
            stats.skipped += 1
            continue
        ewkt = geometry_to_ewkt(row.geometry)
        if not ewkt:
            stats.errors += 1
            continue
        insee = row_value(row, col_map, "insee")
        id_app = row_value(row, col_map, "id_app")
        id_denom = row_value(row, col_map, "id_denom")
        id_aire = row_value(row, col_map, "id_aire")
        denom = row_value(row, col_map, "denom")
        section = row_value(row, col_map, "section")
        numero = row_value(row, col_map, "numero")
        parcel_ref = None
        if section and numero and insee:
            parcel_ref = f"{insee}-{section}-{numero}"
        from shapely import wkt as shapely_wkt

        wkt = shapely_wkt.dumps(to_multipolygon(row.geometry))
        parcel_id = (
            slugify(parcel_ref)
            if parcel_ref
            else stable_parcel_id(
                "inao-parcellaire", wkt, id_app, id_denom, insee, id_aire
            )
        )
        center = centroid_lon_lat(row.geometry)
        payload: dict[str, object] = {
            "id": parcel_id,
            "commune_insee": insee,
            "parcel_ref": parcel_ref,
            "name": denom,
            "geom": ewkt,
            "zoom_min": 14,
            "area_ha": area_ha(row.geometry),
            "inao_id_aire": id_aire,
            "cadastre_section": section,
            "cadastre_numero": numero,
            **provenance_fields("inao-parcellaire"),
        }
        if center:
            payload["center"] = geometry_to_ewkt(Point(center), kind="point")
        if parcel_id in seen_parcel_ids:
            stats.skipped += 1
        else:
            seen_parcel_ids.add(parcel_id)
            bundle.wine_parcels.append(payload)
            stats.kept += 1

        # Link parcel -> wine_area (never classify GC/PC at parcel level for Champagne)
        linked_area_id: Optional[str] = None
        if scope == "champagne" and insee:
            linked_area_id = area_index.get(insee)
        elif scope == "alsace" and denom:
            linked_area_id = slugify(f"alsace-{denom}")
            if linked_area_id not in area_index:
                linked_area_id = None
        if linked_area_id:
            link_key = (linked_area_id, parcel_id)
            if link_key not in seen_links:
                seen_links.add(link_key)
                bundle.wine_area_parcels.append(
                    {
                        "wine_area_id": linked_area_id,
                        "wine_parcel_id": parcel_id,
                        "relationship": "contains",
                        **link_provenance_fields("inao-parcellaire"),
                    }
                )


def build_champagne_commune_areas(
    bundle: IngestBundle,
    stats: IngestStats,
) -> dict[str, str]:
    """Create wine_areas for GC/PC communes. Returns insee -> area_id."""
    ensure_root_wine_areas(bundle, "champagne")
    communes = load_champagne_communes()
    index: dict[str, str] = {}
    for insee, meta in communes.items():
        area_id = slugify(f"champagne-{meta['name']}-{insee}")
        index[insee] = area_id
        bundle.wine_areas.append(
            {
                "id": area_id,
                "name": meta["name"],
                "level": 3,
                "parent_id": "champagne",
                "root_region_id": "champagne",
                "region_type": meta["region_type"],
                "zoom_min": 10,
                "zoom_max": 22,
                "available_data_scopes": [],
                "provisional": False,
                "insee_commune": insee,
                **provenance_fields("inao-siqo"),
            }
        )
        stats.kept += 1
    return index


def process_cadastre_lieux_dits(
    gdf: gpd.GeoDataFrame,
    scope: str,
    stats: IngestStats,
    bundle: IngestBundle,
    commune_area_index: dict[str, str],
    seen_features: Optional[set[tuple[str, str, str]]] = None,
) -> None:
    col_map = inspect_columns(gdf, f"{scope}-cadastre")
    if seen_features is None:
        seen_features = set()
    for _, row in gdf.iterrows():
        stats.read += 1
        insee = row_value(row, col_map, "insee")
        if not insee_in_scope(insee, scope):
            stats.skipped += 1
            continue
        name = row_value(row, col_map, "lieudit")
        if not name:
            stats.skipped += 1
            continue
        ewkt = geometry_to_ewkt(row.geometry)
        if not ewkt:
            stats.errors += 1
            continue
        feature_key = (insee or "", name or "", ewkt)
        if feature_key in seen_features:
            stats.skipped += 1
            continue
        seen_features.add(feature_key)
        section = row_value(row, col_map, "section")
        numero = row_value(row, col_map, "numero")
        cadastre_ref = f"{insee}-{section}-{numero}" if section and numero else None
        lieu_id = slugify(
            f"lieu-{insee}-{name}-{stable_hash(ewkt, length=10)}"
        )
        center = centroid_lon_lat(row.geometry)
        payload: dict[str, object] = {
            "id": lieu_id,
            "name": name,
            "commune_insee": insee,
            "wine_area_id": commune_area_index.get(insee or ""),
            "geom": ewkt,
            "cadastre_source_ref": cadastre_ref,
            **provenance_fields("etalab-cadastre"),
        }
        if center:
            payload["center"] = geometry_to_ewkt(Point(center), kind="point")
        bundle.wine_lieux_dits.append(payload)
        stats.kept += 1


def build_source_dataset_rows() -> list[dict[str, object]]:
    now = datetime.now(timezone.utc).isoformat()
    return [{"id": ds_id, "source_updated_at": now} for ds_id in CATALOG_DATASET_IDS]


def ensure_root_wine_areas(bundle: IngestBundle, *area_ids: str) -> None:
    """Insert level-1/2 navigation nodes required as parent_id FK targets."""
    existing = {str(a["id"]) for a in bundle.wine_areas}
    for area_id in area_ids:
        if area_id in existing:
            continue
        template = ROOT_WINE_AREAS.get(area_id)
        if not template:
            continue
        bundle.wine_areas.append({**template, **provenance_fields("inao-siqo")})
        existing.add(area_id)


def _fixture_path(fixture_dir: Optional[Path], name: str) -> Optional[Path]:
    if not fixture_dir:
        return None
    path = fixture_dir / name
    return path if path.is_file() else None


def _process_parcellaire_file(
    path: Path,
    region_scope: str,
    bundle: IngestBundle,
    area_index: dict[str, str],
    stats_key: str,
    stats_map: dict[str, IngestStats],
) -> None:
    gdf = load_geodata(path)
    st = IngestStats()
    process_parcellaire(gdf, region_scope, st, bundle, area_index)
    stats_map[stats_key] = st


def run_scope(
    scope: str,
    raw_dir: Path,
    *,
    skip_download: bool,
    allow_download: bool,
    fixture_dir: Optional[Path],
    include_national_geo: bool = False,
    force_download: bool = False,
) -> tuple[IngestBundle, dict[str, IngestStats]]:
    bundle = IngestBundle()
    bundle.source_datasets = build_source_dataset_rows()
    stats_map: dict[str, IngestStats] = {}

    if scope == "bourgogne":
        print("scope=bourgogne: structure only — no import in initial scope")
        return bundle, stats_map

    if scope in ("alsace", "all-initial"):
        print("--- Alsace ---")
        aires_path = _fixture_path(fixture_dir, "alsace-aires-sample.geojson")
        if not aires_path:
            aires_path = ensure_dataset_file(
                "inao-aires-geo",
                raw_dir,
                skip_download=skip_download,
                allow_download=allow_download,
                fixture_dir=fixture_dir,
                include_national_geo=include_national_geo,
                force_download=force_download,
            )
        if aires_path:
            gdf = load_geodata(aires_path)
            st = IngestStats()
            process_alsace_aires(gdf, st, bundle)
            stats_map["alsace-aires"] = st

        area_index = {str(a["id"]): str(a["id"]) for a in bundle.wine_areas}
        parcel_path = _fixture_path(fixture_dir, "alsace-parcellaire-sample.geojson")
        if not parcel_path:
            parcel_path = ensure_dataset_file(
                "inao-parcellaire",
                raw_dir,
                skip_download=skip_download,
                allow_download=allow_download,
                fixture_dir=fixture_dir,
                include_national_geo=include_national_geo,
                force_download=force_download,
            )
        if parcel_path:
            _process_parcellaire_file(
                parcel_path,
                "alsace",
                bundle,
                area_index,
                "alsace-parcellaire",
                stats_map,
            )

    if scope in ("champagne", "all-initial"):
        print("--- Champagne ---")
        st_communes = IngestStats()
        commune_index = build_champagne_commune_areas(bundle, st_communes)
        stats_map["champagne-communes"] = st_communes

        # INAO national parcellaire has no Champagne rows (by design: GC/PC communes
        # + cadastre lieux-dits carry fine Champagne geometry — see docs/wine-hierarchy.md).
        parcel_path = _fixture_path(
            fixture_dir, "champagne-parcellaire-sample.geojson"
        )
        if parcel_path:
            _process_parcellaire_file(
                parcel_path,
                "champagne",
                bundle,
                commune_index,
                "champagne-parcellaire",
                stats_map,
            )
        else:
            print(
                "  champagne-parcellaire: skipped "
                "(INAO national parcellaire has no Champagne coverage; "
                "fine geometry comes from etalab-cadastre lieux-dits)"
            )

        cadastre_paths = resolve_cadastre_lieux_dits(raw_dir, scope)
        if not cadastre_paths:
            cadastre_path = _fixture_path(fixture_dir, "cadastre-lieux-dits-sample.geojson")
            if cadastre_path:
                cadastre_paths = [cadastre_path]
            elif not skip_download and allow_download:
                from wine_geodata_download import download_all

                download_all(
                    raw_dir,
                    scope=scope,
                    include_national_geo=False,
                    cadastre_mode="department",
                    force=force_download,
                )
                cadastre_paths = resolve_cadastre_lieux_dits(raw_dir, scope)
        if cadastre_paths:
            st = IngestStats()
            seen_lieux: set[tuple[str, str, str]] = set()
            for cad_path in cadastre_paths:
                gdf = load_geodata(cad_path)
                process_cadastre_lieux_dits(
                    gdf, "champagne", st, bundle, commune_index, seen_lieux
                )
            stats_map["champagne-lieux-dits"] = st

    return bundle, stats_map


# ---------------------------------------------------------------------------
# Supabase upsert (PostgREST, same pattern as meteo importer)
# ---------------------------------------------------------------------------
def _load_project_env() -> None:
    root = Path(__file__).resolve().parent.parent
    for name in (".env", ".env.local", ".env.example"):
        path = root / name
        if path.is_file():
            load_dotenv(path)
            return
    load_dotenv()


def _resolve_env() -> tuple[Optional[str], Optional[str]]:
    url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
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


def _post_batch(endpoint: str, headers: dict[str, str], batch: list[dict]) -> None:
    body = json.dumps(batch, ensure_ascii=False).encode("utf-8")
    req = request.Request(endpoint, data=body, headers=headers, method="POST")
    with request.urlopen(req) as resp:
        resp.read()


def normalize_batch(batch: list[dict[str, object]]) -> list[dict[str, object]]:
    """Ensure every row in a PostgREST batch shares the same keys (PGRST102)."""
    if not batch:
        return batch
    keys = sorted({k for row in batch for k in row})
    return [{k: row.get(k) for k in keys} for row in batch]


def upsert_rows(
    table: str,
    on_conflict: str,
    rows: list[dict[str, object]],
    supabase_url: str,
    service_key: str,
    batch_size: int,
) -> tuple[int, int]:
    if not rows:
        return 0, 0
    endpoint = (
        supabase_url.rstrip("/") + f"/rest/v1/{table}?on_conflict={on_conflict}"
    )
    headers = _headers(service_key)
    headers["prefer"] = "resolution=merge-duplicates,return=minimal"
    written = 0
    errors = 0
    for i in range(0, len(rows), batch_size):
        batch = normalize_batch(rows[i : i + batch_size])
        try:
            _post_batch(endpoint, headers, batch)
            written += len(batch)
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            errors += len(batch)
            print(f"  ! {table}: batch failed ({exc.code}): {detail}", file=sys.stderr)
        except error.URLError as exc:
            errors += len(batch)
            print(f"  ! {table}: network error: {exc.reason}", file=sys.stderr)
    return written, errors


def find_synthetic_collisions(
    table: str,
    id_column: str,
    rows: list[dict[str, object]],
    supabase_url: str,
    service_key: str,
) -> set[str]:
    keys = {str(r[id_column]) for r in rows if r.get(id_column)}
    if not keys:
        return set()
    base = supabase_url.rstrip("/") + f"/rest/v1/{table}"
    headers = _headers(service_key)
    found: set[str] = set()
    sorted_keys = sorted(keys)
    for start in range(0, len(sorted_keys), 100):
        chunk = sorted_keys[start : start + 100]
        quoted = ",".join('"' + v.replace('"', '""') + '"' for v in chunk)
        query = parse.urlencode(
            {
                "select": id_column,
                "source_type": "eq.synthetic",
                id_column: f"in.({quoted})",
            }
        )
        req = request.Request(f"{base}?{query}", headers=headers, method="GET")
        with request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        for row in data:
            val = row.get(id_column)
            if val is not None:
                found.add(str(val))
    return found


def commit_bundle(
    bundle: IngestBundle,
    supabase_url: str,
    service_key: str,
    batch_size: int,
    allow_overwrite_synthetic: bool,
) -> int:
    tables = [
        ("wine_areas", "id", bundle.wine_areas),
        ("wine_parcels", "id", bundle.wine_parcels),
        ("wine_area_parcels", "wine_area_id,wine_parcel_id", bundle.wine_area_parcels),
        ("wine_lieux_dits", "id", bundle.wine_lieux_dits),
    ]
    skip_synthetic_guard = set()
    exit_code = 0
    for table, conflict, rows in tables:
        if not allow_overwrite_synthetic and rows and table not in skip_synthetic_guard:
            id_col = conflict.split(",")[0]
            try:
                collisions = find_synthetic_collisions(
                    table, id_col, rows, supabase_url, service_key
                )
            except error.HTTPError as exc:
                print(f"ERROR: synthetic guard on {table}: {exc}", file=sys.stderr)
                return 1
            if collisions:
                sample = ", ".join(sorted(collisions)[:5])
                print(
                    f"ERROR: {table}: {len(collisions)} synthetic collision(s) "
                    f"(e.g. {sample}). Use --allow-overwrite-synthetic.",
                    file=sys.stderr,
                )
                return 1
        written, errs = upsert_rows(
            table, conflict, rows, supabase_url, service_key, batch_size
        )
        print(f"table={table} upserted={written} errors={errs}")
        if errs:
            exit_code = 1
    return exit_code


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def print_summary(bundle: IngestBundle, stats_map: dict[str, IngestStats]) -> None:
    for label, st in stats_map.items():
        print(
            f"layer={label} lues={st.read} retenues={st.kept} "
            f"ignorées={st.skipped} erreurs={st.errors}"
        )
    print(
        f"totaux: source_datasets={len(bundle.source_datasets)} "
        f"wine_areas={len(bundle.wine_areas)} wine_parcels={len(bundle.wine_parcels)} "
        f"wine_area_parcels={len(bundle.wine_area_parcels)} "
        f"wine_lieux_dits={len(bundle.wine_lieux_dits)}"
    )


def main(argv: Optional[list[str]] = None) -> int:
    _load_project_env()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--scope",
        choices=["alsace", "champagne", "all-initial", "bourgogne"],
        default="all-initial",
        help="Regional import scope (default: all-initial).",
    )
    parser.add_argument(
        "--raw-dir",
        default=DEFAULT_RAW_DIR,
        help=f"Local raw geodata directory (default: {DEFAULT_RAW_DIR}).",
    )
    parser.add_argument(
        "--fixture-dir",
        help="Offline GeoJSON fixtures (e.g. scripts/fixtures/wine-geodata).",
    )
    parser.add_argument(
        "--skip-download",
        action="store_true",
        help="Never download; only read existing files under --raw-dir.",
    )
    parser.add_argument(
        "--allow-download",
        action="store_true",
        help="Download missing files (data.gouv.fr API + cadastre Etalab).",
    )
    parser.add_argument(
        "--download-only",
        action="store_true",
        help="Only download raw files; do not parse or write to Supabase.",
    )
    parser.add_argument(
        "--include-national-geo",
        action="store_true",
        help="Also download national INAO shapefiles (~90 + ~270 MB).",
    )
    parser.add_argument(
        "--force-download",
        action="store_true",
        help="Re-download even if local files already exist.",
    )
    parser.add_argument(
        "--cadastre-mode",
        choices=["department", "commune"],
        default="department",
        help="Cadastre fetch: per department (default) or per GC/PC commune.",
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
    mode.add_argument("--dry-run", action="store_true", help="Force dry-run (default).")
    args = parser.parse_args(argv)

    raw_dir = Path(args.raw_dir)
    fixture_dir = Path(args.fixture_dir) if args.fixture_dir else None

    if args.download_only:
        if not args.allow_download:
            print("ERROR: --download-only requires --allow-download.", file=sys.stderr)
            return 1
        return run_download_phase(
            raw_dir,
            args.scope,
            include_national_geo=args.include_national_geo,
            cadastre_mode=args.cadastre_mode,
            force=args.force_download,
        )

    if args.allow_download and not args.skip_download and not fixture_dir:
        dl_code = run_download_phase(
            raw_dir,
            args.scope,
            include_national_geo=args.include_national_geo,
            cadastre_mode=args.cadastre_mode,
            force=args.force_download,
        )
        if dl_code != 0:
            print("WARNING: some downloads failed; continuing with local files.")

    bundle, stats_map = run_scope(
        args.scope,
        raw_dir,
        skip_download=args.skip_download or bool(fixture_dir),
        allow_download=args.allow_download,
        fixture_dir=fixture_dir,
        include_national_geo=args.include_national_geo,
        force_download=args.force_download,
    )
    print_summary(bundle, stats_map)

    if not args.commit:
        print("mode=dry-run: no data written. Re-run with --commit to write.")
        return 0

    supabase_url, service_key = _resolve_env()
    if not supabase_url or not service_key:
        print(
            "ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for --commit.",
            file=sys.stderr,
        )
        return 1
    return commit_bundle(
        bundle,
        supabase_url,
        service_key,
        args.batch_size,
        args.allow_overwrite_synthetic,
    )


if __name__ == "__main__":
    raise SystemExit(main())
