"""Download helpers for French wine geodata (data.gouv.fr API + cadastre Etalab).

All network access is explicit: callers must pass ``allow_download=True``.
Large national INAO shapefiles (~90–270 MB) require ``include_national_geo=True``.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import re
import shutil
import sys
import zipfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Optional
from urllib import error, request

USER_AGENT = "carte-viticole-ingest/1.0"
DATAGOUV_API = "https://www.data.gouv.fr/api/1/datasets"
CADASTRE_BUNDLER = "https://cadastre.data.gouv.fr/bundler/cadastre-etalab"
CADASTRE_DEPT_BASE = (
    "https://cadastre.data.gouv.fr/data/etalab-cadastre/latest/geojson/departements"
)

# National archives (pick largest zip excluding obvious outliers like Martinique rum).
NATIONAL_TITLE_RE = re.compile(
    r"delim-(?:aire-geographique|parcellaire-aoc)-shp\.zip$", re.I
)
SKIP_TITLE_RE = re.compile(r"martinique|rhum", re.I)

SCOPE_DEPARTMENTS: dict[str, tuple[str, ...]] = {
    "alsace": ("67", "68"),
    "champagne": ("08", "10", "51", "52"),
    "all-initial": ("08", "10", "51", "52", "67", "68"),
}


@dataclass
class ResourceInfo:
    id: str
    title: str
    url: str
    format: str
    filesize: Optional[int]
    last_modified: Optional[str]


@dataclass
class DownloadResult:
    dataset_id: str
    status: str  # ok | skipped | failed
    path: Optional[Path] = None
    bytes_written: int = 0
    message: str = ""


@dataclass
class DownloadSummary:
    results: list[DownloadResult] = field(default_factory=list)
    manifest_path: Optional[Path] = None

    @property
    def ok(self) -> int:
        return sum(1 for r in self.results if r.status == "ok")

    @property
    def failed(self) -> int:
        return sum(1 for r in self.results if r.status == "failed")


@dataclass
class DataGouvDataset:
    dataset_id: str
    slug: str
    kind: str  # csv | national-geo | any
    resource_filter: Optional[Callable[[list[ResourceInfo]], Optional[ResourceInfo]]] = None


DATA_GOUV_DATASETS: dict[str, DataGouvDataset] = {
    "inao-siqo": DataGouvDataset(
        dataset_id="inao-siqo",
        slug=(
            "referentiel-des-produits-sous-signe-officiel-didentification-de-la-"
            "qualite-et-de-lorigine-siqo"
        ),
        kind="csv",
    ),
    "inao-aires-produits": DataGouvDataset(
        dataset_id="inao-aires-produits",
        slug="aires-et-produits-aoc-aop-et-igp",
        kind="csv",
    ),
    "inao-aires-geo": DataGouvDataset(
        dataset_id="inao-aires-geo",
        slug="delimitation-des-aires-geographiques-des-siqo",
        kind="national-geo",
    ),
    "inao-parcellaire": DataGouvDataset(
        dataset_id="inao-parcellaire",
        slug="delimitation-parcellaire-des-aoc-viticoles-de-linao",
        kind="national-geo",
    ),
}


def _http_request(url: str, method: str = "GET") -> request.Request:
    return request.Request(url, headers={"User-Agent": USER_AGENT}, method=method)


def fetch_datagouv_resources(slug: str) -> tuple[dict, list[ResourceInfo]]:
    api_url = f"{DATAGOUV_API}/{slug}/"
    with request.urlopen(_http_request(api_url)) as resp:
        meta = json.loads(resp.read().decode("utf-8"))
    resources: list[ResourceInfo] = []
    for raw in meta.get("resources") or []:
        url = raw.get("url")
        if not url:
            continue
        resources.append(
            ResourceInfo(
                id=str(raw.get("id", "")),
                title=str(raw.get("title") or ""),
                url=url,
                format=str(raw.get("format") or "").lower(),
                filesize=raw.get("filesize"),
                last_modified=raw.get("last_modified"),
            )
        )
    return meta, resources


def pick_csv_resource(resources: list[ResourceInfo]) -> Optional[ResourceInfo]:
    csvs = [r for r in resources if r.format == "csv" or r.title.lower().endswith(".csv")]
    if not csvs:
        return None
    return max(csvs, key=lambda r: r.filesize or 0)


def pick_national_geo_resource(resources: list[ResourceInfo]) -> Optional[ResourceInfo]:
    candidates = [
        r
        for r in resources
        if r.format == "zip"
        and NATIONAL_TITLE_RE.search(r.title)
        and not SKIP_TITLE_RE.search(r.title)
    ]
    if candidates:
        return max(candidates, key=lambda r: r.filesize or 0)
    zips = [r for r in resources if r.format == "zip" and not SKIP_TITLE_RE.search(r.title)]
    return max(zips, key=lambda r: r.filesize or 0) if zips else None


def pick_resource_for_dataset(ds: DataGouvDataset, resources: list[ResourceInfo]) -> Optional[ResourceInfo]:
    if ds.resource_filter:
        return ds.resource_filter(resources)
    if ds.kind == "csv":
        return pick_csv_resource(resources)
    if ds.kind == "national-geo":
        return pick_national_geo_resource(resources)
    return resources[0] if resources else None


def _format_bytes(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.1f}{unit}" if unit != "B" else f"{n}{unit}"
        n /= 1024
    return f"{n:.1f}TB"


def stream_download(url: str, dest: Path, *, expected_size: Optional[int] = None) -> int:
    """Stream URL to ``dest``. Returns bytes written."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    req = _http_request(url)
    written = 0
    block = 1024 * 256
    with request.urlopen(req) as resp, tmp.open("wb") as out:
        while True:
            chunk = resp.read(block)
            if not chunk:
                break
            out.write(chunk)
            written += len(chunk)
            if expected_size and expected_size > 0 and written % (block * 40) < block:
                pct = min(100, int(written * 100 / expected_size))
                print(
                    f"    … {_format_bytes(written)} / {_format_bytes(expected_size)} ({pct}%)",
                    end="\r",
                    file=sys.stderr,
                )
    if expected_size:
        print(file=sys.stderr)
    tmp.replace(dest)
    return written


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def extract_zip(archive: Path, dest_dir: Path) -> list[Path]:
    dest_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive, "r") as zf:
        zf.extractall(dest_dir)
    return sorted(dest_dir.rglob("*.shp"))


def gunzip_file(src: Path, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(src, "rb") as inf, dest.open("wb") as outf:
        shutil.copyfileobj(inf, outf)


def download_datagouv_dataset(
    ds: DataGouvDataset,
    raw_dir: Path,
    *,
    include_national_geo: bool,
    force: bool,
) -> DownloadResult:
    if ds.kind == "national-geo" and not include_national_geo:
        return DownloadResult(
            ds.dataset_id,
            "skipped",
            message="national shapefile (pass --include-national-geo)",
        )

    out_dir = raw_dir / ds.dataset_id
    out_dir.mkdir(parents=True, exist_ok=True)

    try:
        meta, resources = fetch_datagouv_resources(ds.slug)
    except error.URLError as exc:
        return DownloadResult(ds.dataset_id, "failed", message=f"API error: {exc.reason}")

    resource = pick_resource_for_dataset(ds, resources)
    if not resource:
        return DownloadResult(ds.dataset_id, "failed", message="no matching resource")

    filename = resource.title or resource.url.rstrip("/").split("/")[-1]
    dest = out_dir / filename
    meta_path = out_dir / "dataset-meta.json"

    if dest.is_file() and not force:
        return DownloadResult(
            ds.dataset_id,
            "ok",
            path=dest,
            bytes_written=dest.stat().st_size,
            message="already present (use --force-download to refresh)",
        )

    size_hint = resource.filesize or 0
    print(
        f"  download {ds.dataset_id}: {filename} "
        f"({_format_bytes(size_hint) if size_hint else 'size unknown'})"
    )
    try:
        written = stream_download(resource.url, dest, expected_size=size_hint or None)
    except error.URLError as exc:
        return DownloadResult(ds.dataset_id, "failed", message=f"download error: {exc.reason}")

    meta_path.write_text(
        json.dumps(
            {
                "dataset_id": ds.dataset_id,
                "slug": ds.slug,
                "title": meta.get("title"),
                "resource": {
                    "id": resource.id,
                    "title": resource.title,
                    "url": resource.url,
                    "filesize": resource.filesize,
                    "last_modified": resource.last_modified,
                },
                "downloaded_at": datetime.now(timezone.utc).isoformat(),
                "sha256": sha256_file(dest),
                "bytes": written,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    extracted: Optional[Path] = None
    if dest.suffix.lower() == ".zip":
        extract_dir = out_dir / "extracted"
        shps = extract_zip(dest, extract_dir)
        if shps:
            extracted = shps[0]
            print(f"    extracted shapefile: {extracted.relative_to(raw_dir)}")

    return DownloadResult(
        ds.dataset_id,
        "ok",
        path=extracted or dest,
        bytes_written=written,
        message="downloaded",
    )


def cadastre_dept_url(department: str, layer: str) -> str:
    return f"{CADASTRE_DEPT_BASE}/{department}/cadastre-{department}-{layer}.json.gz"


def cadastre_commune_url(insee: str, layer: str) -> str:
    return f"{CADASTRE_BUNDLER}/communes/{insee}/geojson/{layer}"


def download_cadastre_department(
    department: str,
    layer: str,
    raw_dir: Path,
    *,
    force: bool,
) -> DownloadResult:
    dataset_id = f"etalab-cadastre-dept-{department}-{layer}"
    out_dir = raw_dir / "etalab-cadastre" / "departements" / department
    out_dir.mkdir(parents=True, exist_ok=True)
    gz_path = out_dir / f"cadastre-{department}-{layer}.json.gz"
    geojson_path = out_dir / f"cadastre-{department}-{layer}.geojson"

    if geojson_path.is_file() and not force:
        return DownloadResult(
            dataset_id,
            "ok",
            path=geojson_path,
            bytes_written=geojson_path.stat().st_size,
            message="already present",
        )

    url = cadastre_dept_url(department, layer)
    print(f"  download cadastre dept {department} ({layer})")
    try:
        written = stream_download(url, gz_path)
        gunzip_file(gz_path, geojson_path)
    except error.URLError as exc:
        return DownloadResult(dataset_id, "failed", message=str(exc.reason))

    return DownloadResult(
        dataset_id,
        "ok",
        path=geojson_path,
        bytes_written=written,
        message="downloaded",
    )


def download_cadastre_commune(
    insee: str,
    layer: str,
    raw_dir: Path,
    *,
    force: bool,
) -> DownloadResult:
    dataset_id = f"etalab-cadastre-commune-{insee}-{layer}"
    out_dir = raw_dir / "etalab-cadastre" / "communes" / insee
    out_dir.mkdir(parents=True, exist_ok=True)
    dest = out_dir / f"{layer}.geojson"

    if dest.is_file() and not force:
        return DownloadResult(
            dataset_id,
            "ok",
            path=dest,
            bytes_written=dest.stat().st_size,
            message="already present",
        )

    url = cadastre_commune_url(insee, layer)
    print(f"  download cadastre commune {insee} ({layer})")
    try:
        written = stream_download(url, dest)
    except error.URLError as exc:
        return DownloadResult(dataset_id, "failed", message=str(exc.reason))

    return DownloadResult(
        dataset_id,
        "ok",
        path=dest,
        bytes_written=written,
        message="downloaded",
    )


def download_all(
    raw_dir: Path,
    *,
    scope: str,
    include_national_geo: bool,
    cadastre_mode: str = "department",
    champagne_communes: Optional[list[str]] = None,
    force: bool = False,
) -> DownloadSummary:
    """Download all datasets needed for ``scope``."""
    raw_dir.mkdir(parents=True, exist_ok=True)
    summary = DownloadSummary()

    # Small CSV referentials (always useful, no geometry).
    for ds_id in ("inao-siqo", "inao-aires-produits"):
        ds = DATA_GOUV_DATASETS[ds_id]
        summary.results.append(
            download_datagouv_dataset(
                ds, raw_dir, include_national_geo=False, force=force
            )
        )

    if include_national_geo:
        for ds_id in ("inao-aires-geo", "inao-parcellaire"):
            ds = DATA_GOUV_DATASETS[ds_id]
            summary.results.append(
                download_datagouv_dataset(
                    ds, raw_dir, include_national_geo=True, force=force
                )
            )

    departments = SCOPE_DEPARTMENTS.get(scope, SCOPE_DEPARTMENTS["all-initial"])

    if cadastre_mode == "commune" and champagne_communes:
        for insee in champagne_communes:
            summary.results.append(
                download_cadastre_commune(
                    insee, "lieux_dits", raw_dir, force=force
                )
            )
    else:
        for dept in departments:
            summary.results.append(
                download_cadastre_department(
                    dept, "lieux_dits", raw_dir, force=force
                )
            )

    manifest = {
        "downloaded_at": datetime.now(timezone.utc).isoformat(),
        "scope": scope,
        "include_national_geo": include_national_geo,
        "cadastre_mode": cadastre_mode,
        "results": [
            {
                "dataset_id": r.dataset_id,
                "status": r.status,
                "path": str(r.path) if r.path else None,
                "bytes": r.bytes_written,
                "message": r.message,
            }
            for r in summary.results
        ],
    }
    manifest_path = raw_dir / "download-manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    summary.manifest_path = manifest_path
    return summary


def print_summary(summary: DownloadSummary) -> None:
    total_bytes = sum(r.bytes_written for r in summary.results if r.status == "ok")
    print(
        f"download: ok={summary.ok} failed={summary.failed} "
        f"total={_format_bytes(total_bytes)}"
    )
    for r in summary.results:
        if r.status != "ok":
            print(f"  [{r.status}] {r.dataset_id}: {r.message}")
        else:
            rel = r.path.name if r.path else "?"
            print(f"  [ok] {r.dataset_id}: {rel} ({_format_bytes(r.bytes_written)})")
    if summary.manifest_path:
        print(f"manifest: {summary.manifest_path}")
