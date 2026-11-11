"""
Build the map search index (ADR 0023): `public/search-index.json`.

One compact row per searchable place — régions, sous-régions, appellations,
villages, premiers / grands crus, lieux-dits, communes viticoles, domaines —
with its kind, its root region and its bounding box, so the browser can search
instantly (no request per keystroke) and frame the place it lands on.

Read-only on Supabase (PostgREST, service key from .env / .env.local). Re-run
after any ingestion that adds or renames areas, lieux-dits or domains:

    python scripts/build_search_index.py            # writes public/search-index.json
    python scripts/build_search_index.py --check    # prints counts, writes nothing

Provenance is kept per row (index into `ds`), never dropped (AGENTS.md §5).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(ROOT, "public", "search-index.json")
PAGE = 1000


def load_env() -> tuple[str, str]:
    for name in (".env", ".env.local"):
        path = os.path.join(ROOT, name)
        if not os.path.isfile(path):
            continue
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"'))
    url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get(
        "NEXT_PUBLIC_SUPABASE_ANON_KEY"
    )
    if not url or not key:
        sys.exit("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing (.env.local)")
    return url.rstrip("/"), key


def fetch_all(base: str, key: str, table: str, select: str, extra: str = "") -> list[dict]:
    rows: list[dict] = []
    offset = 0
    while True:
        q = f"select={urllib.parse.quote(select, safe=',()*:')}&order=id&limit={PAGE}&offset={offset}"
        if extra:
            q += "&" + extra
        req = urllib.request.Request(
            f"{base}/rest/v1/{table}?{q}",
            headers={"apikey": key, "authorization": f"Bearer {key}", "accept": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=120) as resp:
            page = json.load(resp)
        rows.extend(page)
        if len(page) < PAGE:
            return rows
        offset += PAGE


def bbox_of(geom: dict | None) -> list[float] | None:
    """[west, south, east, north] of a GeoJSON geometry, 5 decimals (~1 m)."""
    if not geom:
        return None
    xs: list[float] = []
    ys: list[float] = []

    def walk(c):
        if isinstance(c[0], (int, float)):
            xs.append(c[0])
            ys.append(c[1])
        else:
            for x in c:
                walk(x)

    walk(geom["coordinates"])
    if not xs:
        return None
    return [round(min(xs), 5), round(min(ys), 5), round(max(xs), 5), round(max(ys), 5)]


def merge_bbox(a: list[float] | None, b: list[float] | None) -> list[float] | None:
    if not a:
        return b
    if not b:
        return a
    return [min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3])]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--check", action="store_true", help="count only, write nothing")
    args = ap.parse_args()
    base, key = load_env()

    ds_rows: list[list] = []
    ds_index: dict[tuple, int] = {}

    def ds(r: dict) -> int:
        k = (
            r.get("source_dataset_id"),
            r.get("source_type") or "real",
            bool(r.get("is_official")),
            bool(r.get("is_informative")),
            r.get("license"),
            r.get("attribution"),
        )
        if k not in ds_index:
            ds_index[k] = len(ds_rows)
            ds_rows.append(list(k))
        return ds_index[k]

    prov = "source_dataset_id,source_type,is_official,is_informative,license,attribution"

    # --- areas --------------------------------------------------------------
    areas = fetch_all(
        base, key, "wine_areas",
        f"id,name,level,region_type,root_region_id,parent_id,map_visible,geom_display,geom,{prov}",
    )
    area_by_id = {a["id"]: a for a in areas}
    entries: list[list] = []
    for a in areas:
        box = bbox_of(a.get("geom_display")) or bbox_of(a.get("geom"))
        if not box:
            continue
        parent = area_by_id.get(a.get("parent_id") or "")
        entries.append([
            "area", a["id"], a["name"], a["region_type"], a["level"],
            a["root_region_id"], a.get("parent_id"),
            parent["name"] if parent else None,
            box, ds(a), None, 1 if a.get("map_visible") else 0,
        ])

    # --- communes (from the planted vines: name + extent) --------------------
    vines = fetch_all(base, key, "vine_plots", "id,commune_insee,commune_name,root_region_id,center")
    communes: dict[str, dict] = {}
    for v in vines:
        insee = v.get("commune_insee")
        if not insee or not v.get("center"):
            continue
        c = communes.setdefault(
            insee, {"name": v.get("commune_name"), "root": v.get("root_region_id"), "box": None}
        )
        c["box"] = merge_bbox(c["box"], bbox_of(v["center"]))
        if not c["name"] and v.get("commune_name"):
            c["name"] = v["commune_name"]
    commune_name = {k: c["name"] for k, c in communes.items() if c["name"]}

    # --- lieux-dits ---------------------------------------------------------
    lieux = fetch_all(
        base, key, "wine_lieux_dits",
        f"id,name,commune_insee,wine_area_id,cadastre_source_ref,geom,{prov}",
    )
    for l in lieux:
        box = bbox_of(l.get("geom"))
        if not box or not l.get("name"):
            continue
        area = area_by_id.get(l.get("wine_area_id") or "")
        insee = l.get("commune_insee")
        context = commune_name.get(insee or "") or (area["name"] if area else None)
        entries.append([
            "lieu-dit", l["id"], l["name"], "lieu-dit", None,
            area["root_region_id"] if area else None, l.get("wine_area_id"),
            context, box, ds(l), insee, 1,
        ])

    for insee, c in communes.items():
        if not c["name"] or not c["box"]:
            continue
        entries.append([
            "commune", f"commune-{insee}", c["name"], "commune", None,
            c["root"], None, None, c["box"], None, insee, 1,
        ])

    # --- domains ------------------------------------------------------------
    domains = fetch_all(base, key, "wine_domains_api", "id,name,commune,root_region_id,lon,lat")
    for d in domains:
        if d.get("lon") is None or d.get("lat") is None:
            continue
        lon, lat = round(d["lon"], 5), round(d["lat"], 5)
        entries.append([
            "domain", d["id"], d["name"], "domaine", None,
            d["root_region_id"], None, d.get("commune"), [lon, lat, lon, lat], None, None, 1,
        ])

    counts: dict[str, int] = {}
    for e in entries:
        counts[e[3]] = counts.get(e[3], 0) + 1
    print(json.dumps(counts, ensure_ascii=False, indent=1))
    print(f"{len(entries)} entries")
    if args.check:
        return

    out = {
        "v": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        # [sourceDatasetId, sourceType, isOfficial, isInformative, license, attribution]
        "ds": ds_rows,
        # [kind, id, name, regionType, level, rootRegionId, parentId, context,
        #  [w,s,e,n], dsIdx, communeInsee, mapVisible]
        "e": entries,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"wrote {OUT} ({os.path.getsize(OUT) // 1024} KB)")


if __name__ == "__main__":
    main()
