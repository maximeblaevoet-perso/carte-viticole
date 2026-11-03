"""Planted Alsace vineyard: vine plots, terroir score, estimated domain scores.

The INAO "parcellaire" is a *delimited* area (commune × denomination): it holds
forest, orchards and houses as well as vines. This script builds the layer of
vines actually planted, as the Taillades map does (ADR 0016):

1. RPG (PAC declarations, crop group 21 "Vignes") — the most reliable "there
   are vines this year" source; then BD TOPO IGN `zone_de_vegetation`
   nature = "Vigne" (photo-interpreted) only where the RPG has nothing.
2. Kept only inside the AOC Alsace aire (INAO parcellaire, 67/68).
3. Enriched with commune, appellation / grand cru, cadastral lieu-dit,
   dominant BD Charm-50 formation, altitude / slope / aspect (RGE ALTI, centre
   ± 30 m) and INRAE RRP dominant soil.
4. Scored with ``src/data/terroir-score-alsace.json`` (scripts/terroir_score.py).
5. Reference domains of ``scripts/data/alsace-domains.json`` scored from what
   they declare: grands crus and lieux-dits, the rest at the average of their
   communes (ADR 0019). No plot is attributed to a domain.

Every network step is cached in ``data/processed/alsace/`` (gitignored): a
re-run only recomputes what is missing. ``--refresh`` drops the caches.

Usage:
    python scripts/build_alsace_vineyard.py                 # build + summary (dry-run)
    python scripts/build_alsace_vineyard.py --commit        # + replace vine_plots / wine_domains
    python scripts/build_alsace_vineyard.py --commit --prune
        # + delete the Alsace INAO aire "parcels" and the lieux-dits without vines,
        #   and clip the remaining lieux-dits to their planted part
    python scripts/build_alsace_vineyard.py --lieux-dits-only
        # only the lieu-dit clipping, from the cached vine_plots.gpkg
    python scripts/build_alsace_vineyard.py --domains-only [--commit]
        # only the domain scores, from the cached vine_plots.gpkg
"""
from __future__ import annotations

import argparse
import json
import math
import ssl
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import pyogrio
import shapely

sys.path.insert(0, str(Path(__file__).resolve().parent))
import terroir_score as ts  # noqa: E402
from ingest_wine_geodata import (  # noqa: E402
    _headers,
    _load_project_env,
    _resolve_env,
    geometry_to_ewkt,
    slugify,
    upsert_rows,
)

for _s in (sys.stdout, sys.stderr):  # Windows consoles default to cp1252
    try:
        _s.reconfigure(encoding="utf-8")
    except Exception:
        pass

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "wine-geodata"
CACHE = ROOT / "data" / "processed" / "alsace"
DOMAINS_PATH = ROOT / "scripts" / "data" / "alsace-domains.json"
L93 = 2154
DEPARTMENTS = ("67", "68")
BBOX = (7.0, 47.55, 7.95, 49.08)  # lon/lat, the whole Alsatian vineyard
WFS = "https://data.geopf.fr/wfs/ows"
ALTI = "https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json"
UA = {"User-Agent": "carte-viticole/1.0 (build_alsace_vineyard)"}
HALF_STEP_M = 30  # slope/aspect from centre ± 30 m
BDTOPO_MIN_M2 = 1500  # BD TOPO crumbs < 0.15 ha are RPG plot edges
LIEU_MIN_VINE_M2 = 1000  # a lieu-dit with < 0.1 ha of vines is forest / village
LIEU_MIN_PART_M2 = 100  # clipped pieces < 1 a are overlap crumbs
LIEU_SLIVER_M = 2  # pieces thinner than 4 m are boundary slivers

try:
    import certifi

    SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:  # pragma: no cover
    SSL_CTX = ssl.create_default_context()


# ---------------------------------------------------------------------------
# Network helpers
# ---------------------------------------------------------------------------
def _get_json(url: str, body: bytes | None = None, timeout: int = 300) -> dict:
    headers = dict(UA)
    if body is not None:
        headers["Content-Type"] = "application/json"
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, data=body, headers=headers)
            with urllib.request.urlopen(req, timeout=timeout, context=SSL_CTX) as r:
                return json.load(r)
        except Exception as exc:  # Géoplateforme drops connections now and then
            if attempt == 4:
                raise
            print(f"    retry ({exc})")
            time.sleep(4 * (attempt + 1))
    raise RuntimeError("unreachable")


def wfs_features(typename: str, cql: str | None, geom_field: str, page: int = 5000) -> gpd.GeoDataFrame:
    filters = [f"BBOX({geom_field},{BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]},'EPSG:4326')"]
    if cql:
        filters.append(f"({cql})")
    feats: list[dict] = []
    start = 0
    while True:
        params = {
            "SERVICE": "WFS", "VERSION": "2.0.0", "REQUEST": "GetFeature",
            "TYPENAMES": typename, "OUTPUTFORMAT": "application/json",
            "SRSNAME": "EPSG:4326", "COUNT": page, "STARTINDEX": start,
            "CQL_FILTER": " AND ".join(filters),
        }
        data = _get_json(WFS + "?" + urllib.parse.urlencode(params))
        batch = data.get("features", [])
        feats.extend(batch)
        print(f"    {typename}: {len(feats)} / {data.get('numberMatched')}")
        if len(batch) < page:
            break
        start += page
    if not feats:
        return gpd.GeoDataFrame(geometry=[], crs=4326)
    return gpd.GeoDataFrame.from_features(feats, crs=4326)


def fix_text(s: object) -> object:
    """The INRAE WFS returns « à » broken (U+FFFD + NBSP)."""
    if not isinstance(s, str):
        return s
    return s.replace("�\xa0", "à").replace("�", "é").strip()


def cached(name: str, build, refresh: bool) -> gpd.GeoDataFrame:
    path = CACHE / f"{name}.gpkg"
    if path.exists() and not refresh:
        return gpd.read_file(path)
    gdf = build()
    gdf.to_file(path, driver="GPKG")
    return gdf


# ---------------------------------------------------------------------------
# Sources
# ---------------------------------------------------------------------------
def fetch_vines() -> gpd.GeoDataFrame:
    print("RPG — parcelles déclarées en vigne (groupe 21)")
    rpg = cached("rpg_raw", lambda: wfs_features("RPG.LATEST:parcelles_graphiques", "code_group='21'", "geom"),
                 False).to_crs(L93)
    rpg = rpg.drop_duplicates("num_parcel")
    rpg["source"] = "rpg"
    rpg["source_ref"] = rpg["num_parcel"].astype(str)
    rpg["is_organic"] = rpg["bio"].fillna(False).astype(bool)

    print("BD TOPO — zones de végétation « Vigne » hors RPG")
    bdt = cached("bdtopo_raw", lambda: wfs_features("BDTOPO_V3:zone_de_vegetation", "nature='Vigne'", "geometrie"),
                 False).to_crs(L93)
    bdt["geometry"] = bdt.geometry.make_valid()
    # Subtract only the RPG plots each zone touches: one difference against the
    # union of 43 000 plots takes hours, the indexed version seconds.
    rpg_buf = rpg.buffer(2).values
    b_idx, r_idx = rpg.sindex.query(bdt.geometry.values, predicate="intersects")
    geoms = bdt.geometry.values.copy()
    for b in np.unique(b_idx):
        geoms[b] = geoms[b].difference(shapely.union_all(rpg_buf[r_idx[b_idx == b]]))
    bdt["geometry"] = geoms
    bdt = bdt.explode(index_parts=False)
    bdt = bdt[bdt.geom_type == "Polygon"]
    bdt = bdt[bdt.area > BDTOPO_MIN_M2].copy()
    bdt["source"] = "bdtopo"
    bdt["source_ref"] = bdt["cleabs"].astype(str) + "-" + bdt.groupby("cleabs").cumcount().astype(str)
    bdt["is_organic"] = None
    bdt["code_cultu"] = None

    cols = ["source", "source_ref", "code_cultu", "is_organic", "geometry"]
    v = gpd.GeoDataFrame(pd.concat([rpg[cols], bdt[cols]], ignore_index=True), crs=L93)
    v["geometry"] = v.geometry.make_valid().simplify(1.0)
    v = v[~v.is_empty & v.geom_type.isin(["Polygon", "MultiPolygon"])].copy()
    print(f"  {int((v.source == 'rpg').sum())} parcelles RPG + {int((v.source == 'bdtopo').sum())} polygones BD TOPO")
    return v


def load_inao() -> gpd.GeoDataFrame:
    shp = sorted((RAW / "inao-parcellaire" / "extracted").glob("*.shp"))[-1]
    where = " OR ".join(f"insee LIKE '{d}%'" for d in DEPARTMENTS)
    df = pyogrio.read_dataframe(shp, where=where)  # UTF-8 (.cpg), not cp1252
    df = df[df["categorie"].fillna("").str.startswith("Vin")]
    return df.set_crs(L93, allow_override=True) if df.crs is None else df.to_crs(L93)


def load_geology() -> gpd.GeoDataFrame:
    frames = []
    for d in DEPARTMENTS:
        shp = next((RAW / "brgm-bdcharm50" / d / "extracted").glob(f"GEO050K_HARM_0{d}_S_FGEOL_2154.shp"))
        g = pyogrio.read_dataframe(shp, encoding="cp1252", columns=["NOTATION", "DESCR"])
        frames.append(g)
    g = gpd.GeoDataFrame(pd.concat(frames, ignore_index=True), crs=L93)
    g["geol_family"] = [ts.rock_family(s) for s in g.DESCR]
    return g


def fetch_soils() -> gpd.GeoDataFrame:
    print("INRAE — sols dominants (RRP 1/250 000)")
    s = wfs_features("INRAE_CARTE-SOLS:sols_dominants_france_metropolitaine", None, "the_geom_l93")
    s["nom_sol_dominant"] = s["nom_sol_dominant"].map(fix_text)
    return s[["nom_sol_dominant", "geometry"]].to_crs(L93)


def elevations(lon: np.ndarray, lat: np.ndarray, chunk: int = 3000) -> np.ndarray:
    out: list[float] = []
    for i in range(0, len(lon), chunk):
        body = json.dumps({
            "lon": "|".join(f"{x:.6f}" for x in lon[i:i + chunk]),
            "lat": "|".join(f"{y:.6f}" for y in lat[i:i + chunk]),
            "resource": "ign_rge_alti_wld", "zonly": "true",
        }).encode()
        out += _get_json(ALTI, body)["elevations"]
        print(f"    altitudes {len(out)}/{len(lon)}")
    z = np.array(out, dtype=float)
    z[z < -1000] = np.nan  # -99999 = outside the DEM
    return z


def relief(v: gpd.GeoDataFrame) -> pd.DataFrame:
    """Altitude at the representative point; slope/aspect from centre ± 30 m."""
    p = v.representative_point()
    offsets = [(0, 0), (0, HALF_STEP_M), (0, -HALF_STEP_M), (HALF_STEP_M, 0), (-HALF_STEP_M, 0)]
    pts = [gpd.GeoSeries(p.translate(dx, dy), crs=L93).to_crs(4326) for dx, dy in offsets]
    lon = np.concatenate([s.x.values for s in pts])
    lat = np.concatenate([s.y.values for s in pts])
    c, n, s, e, w = elevations(lon, lat).reshape(5, -1)
    dzdx = (e - w) / (2 * HALF_STEP_M)
    dzdy = (n - s) / (2 * HALF_STEP_M)
    slope = np.hypot(dzdx, dzdy) * 100
    aspect = (np.degrees(np.arctan2(-dzdx, -dzdy)) + 360) % 360  # downslope direction, 0 = N
    return pd.DataFrame({"id": v["id"].values, "altitude_m": np.round(c, 1),
                         "slope_pct": np.round(slope, 1), "aspect_deg": np.round(aspect)})


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------
def cru_name(denom: str) -> str:
    return denom.split("grand cru", 1)[1].strip() if "grand cru" in denom else denom


def build_plots(refresh: bool) -> gpd.GeoDataFrame:
    CACHE.mkdir(parents=True, exist_ok=True)
    v = cached("vines_raw", fetch_vines, refresh)

    inao = load_inao()
    alsace = inao[inao["denom"] == "Alsace"]
    zone = alsace.buffer(20).union_all()
    pts = v.representative_point()
    v = v[pts.within(zone)].copy()
    v["id"] = np.where(v.source == "rpg", "rpg-" + v.source_ref, "bdt-" + v.source_ref)
    v = v.drop_duplicates("id")
    v["area_ha"] = (v.area / 1e4).round(4)
    print(f"{len(v)} vignes dans l'aire AOC Alsace, {v.area_ha.sum():.0f} ha")

    pts = gpd.GeoDataFrame(v[["id"]], geometry=v.representative_point(), crs=L93)

    # commune = the AOC Alsace aire (commune × denom) the plot sits in
    j = gpd.sjoin(pts, alsace[["insee", "nomcom", "geometry"]], predicate="within", how="left").drop_duplicates("id")
    v["commune_insee"] = v["id"].map(j.set_index("id").insee)
    v["commune_name"] = v["id"].map(j.set_index("id").nomcom).str.title()

    # appellation: grand cru > dénomination géographique complémentaire > Alsace
    gc = inao[inao["denom"].str.contains("grand cru", case=False)]
    dgc = inao[(inao["type_denom"] != "appellation") & ~inao["denom"].str.contains("grand cru", case=False)]
    j = gpd.sjoin(pts, gc[["denom", "geometry"]], predicate="within").drop_duplicates("id").set_index("id")
    v["grand_cru"] = v["id"].map(j.denom.map(cru_name))
    v["wine_area_id"] = v["id"].map(j.denom.map(lambda d: slugify(f"alsace-{d}")))
    j = gpd.sjoin(pts, dgc[["denom", "geometry"]], predicate="within").drop_duplicates("id").set_index("id")
    v["appellation"] = np.where(v.grand_cru.notna(), "Alsace grand cru " + v.grand_cru.fillna(""),
                                v["id"].map(j.denom).fillna("Alsace"))

    print("Lieux-dits cadastraux")
    frames = []
    for d in DEPARTMENTS:
        ld = gpd.read_file(RAW / "etalab-cadastre" / "departements" / d / f"cadastre-{d}-lieux_dits.geojson",
                           bbox=tuple(v.to_crs(4326).total_bounds))
        frames.append(ld[["nom", "geometry"]])
    ld = gpd.GeoDataFrame(pd.concat(frames, ignore_index=True), crs=frames[0].crs).to_crs(L93)
    j = gpd.sjoin(pts, ld, predicate="within").drop_duplicates("id").set_index("id")
    v["lieu_dit"] = v["id"].map(j.nom)

    print("Géologie BD Charm-50 (formation dominante)")
    g = load_geology()
    g = g.iloc[np.unique(g.sindex.query(v.geometry, predicate="intersects")[1])]
    ov = gpd.overlay(v[["id", "geometry"]], g, how="intersection", keep_geom_type=True)
    ov["a"] = ov.area
    dom = ov.sort_values("a", ascending=False).drop_duplicates("id").set_index("id")
    v["geol_notation"] = v["id"].map(dom.NOTATION)
    v["geol_descr"] = v["id"].map(dom.DESCR)
    v["geol_family"] = v["id"].map(dom.geol_family).fillna("autre")
    v["geol_dominant_share"] = (v["id"].map(dom.a) / v["id"].map(ov.groupby("id").a.sum())).round(2)

    print("Sol RRP")
    s = cached("soils", fetch_soils, refresh)
    j = gpd.sjoin(pts, s, predicate="within", how="left").drop_duplicates("id").set_index("id")
    v["soil_name"] = v["id"].map(j.nom_sol_dominant)

    print("Relief RGE ALTI")
    rpath = CACHE / "relief.csv"
    rel = pd.read_csv(rpath, dtype={"id": str}) if rpath.exists() and not refresh else pd.DataFrame(columns=["id"])
    missing = v[~v["id"].isin(rel["id"])]
    if len(missing):
        rel = pd.concat([rel, relief(missing)], ignore_index=True)
        rel.to_csv(rpath, index=False)
    v = v.merge(rel, on="id", how="left")

    grid = ts.load_grid()
    recs = v[["geol_family", "slope_pct", "aspect_deg", "altitude_m", "soil_name"]].to_dict("records")
    comp_sun = [ts.components(r, grid, "soleil") for r in recs]
    comp_cool = [ts.components(r, grid, "fraicheur") for r in recs]
    v["score_sun"] = [ts.weighted(c, grid["poids"]) for c in comp_sun]
    v["score_cool"] = [ts.weighted(c, grid["poids"]) for c in comp_cool]
    v["score_components"] = [
        json.dumps({**{k: round(x, 3) for k, x in a.items() if k != "exposition"},
                    "exposition_soleil": a["exposition"], "exposition_fraicheur": b["exposition"]})
        for a, b in zip(comp_sun, comp_cool)
    ]
    return gpd.GeoDataFrame(v, geometry="geometry", crs=L93)


def load_domains() -> list[dict]:
    if not DOMAINS_PATH.exists():
        print(f"  ! {DOMAINS_PATH.name} absent : pas de domaines")
        return []
    return json.loads(DOMAINS_PATH.read_text(encoding="utf-8"))["domaines"]


# Former communes merged into a commune nouvelle: the cadastre and the RPG use
# the new name, domain sheets often the old one.
COMMUNES_NOUVELLES = {
    "kaysersberg": "kaysersberg vignoble",
    "kientzheim": "kaysersberg vignoble",
    "sigolsheim": "kaysersberg vignoble",
}


def _norm(name: str) -> str:
    """Commune key: accents, case and hyphens folded ("Wihr-au-Val" = "Wihr-Au-Val")."""
    key = ts.fold(name).replace("-", " ").strip()
    return COMMUNES_NOUVELLES.get(key, key)


def _to_lonlat(geom: shapely.Geometry) -> shapely.Geometry:
    return gpd.GeoSeries([geom], crs=L93).to_crs(4326).iloc[0]


def _geojson(geom: shapely.Geometry) -> dict:
    """Light outline of a place for the map: gaps closed, 10 m simplified, ~1 m precision."""
    g = _to_lonlat(geom.buffer(10).buffer(-10).simplify(10))
    return json.loads(json.dumps(shapely.geometry.mapping(g)), parse_float=lambda x: round(float(x), 5))


def _weighted_median(x: pd.Series, w: pd.Series) -> float | None:
    ok = x.notna() & (w > 0)
    if not ok.any():
        return None
    order = np.argsort(x[ok].values)
    xs, cw = x[ok].values[order], np.cumsum(w[ok].values[order])
    return float(xs[np.searchsorted(cw, cw[-1] / 2)])


def resolve_places(d: dict, v: gpd.GeoDataFrame) -> tuple[list[tuple[ts.Place, pd.Series, dict]], list[str]]:
    """Declared grands crus and lieux-dits of a domain -> (place, plot mask, map info).

    A lieu-dit is found only through ``lieux_dits_cadastre`` (commune + cadastral
    names): the name in use ("Clos Windsbuhl") rarely equals the cadastre's
    ("WINDSBUEHL"), and the same name exists in many communes. A declared
    lieu-dit lying mostly in a declared grand cru pins that cru to it (Clos
    Saint-Urbain -> the Thann side of the Rangen) instead of counting twice.
    Returns the places and the declared names found nowhere.
    """
    sizes = {ts.fold(k): x for k, x in (d.get("surfaces_ha") or {}).items()}
    specs = d.get("lieux_dits_cadastre") or {}
    unresolved: list[str] = []
    lieux: dict[str, pd.Series] = {}
    for name in d.get("lieux_dits") or []:
        mask = pd.Series(False, index=v.index)
        for s in specs.get(name, []):
            mask |= (v._com == _norm(s["commune"])) & v.lieu_dit.isin(s["cadastre"])
        if mask.any():
            lieux[name] = mask
        else:
            unresolved.append(name)

    out = []
    for cru in d.get("grands_crus") or []:
        mask = v._cru == ts.fold(cru)
        if not mask.any():
            unresolved.append(cru)
            continue
        pins = [n for n, m in lieux.items() if (v.loc[m, "_cru"] == ts.fold(cru)).mean() >= 0.5]
        declared = sizes.get(ts.fold(cru))
        label = cru
        if pins:
            mask = mask & np.logical_or.reduce([lieux.pop(n) for n in pins])
            if declared is None:
                declared = next((sizes[ts.fold(n)] for n in pins if ts.fold(n) in sizes), None)
            label = f"{cru} ({', '.join(pins)})"
        out.append((ts.Place("grand_cru", label, 0, None, None, declared), mask,
                    {"grand_cru": cru, "pinned": bool(pins)}))
    for name, mask in lieux.items():
        out.append((ts.Place("lieu_dit", name, 0, None, None, sizes.get(ts.fold(name))), mask, {}))

    for p, mask, info in out:
        m = v[mask]
        p.vine_ha = float(m.area_ha.sum())
        p.score_sun = ts.weighted_mean(m.score_sun, m.area_ha)
        p.score_cool = ts.weighted_mean(m.score_cool, m.area_ha)
        if p.kind == "lieu_dit" or info.pop("pinned", False):
            info["lieux"] = [{"commune": c, "lieu_dit": ld}
                             for c, ld in m[["commune_name", "lieu_dit"]].drop_duplicates().itertuples(index=False)]
    return out, unresolved


def build_domains(v: gpd.GeoDataFrame, raw: list[dict]) -> list[dict]:
    """Score each reference domain from what it declares (ADR 0019).

    Declared grands crus and lieux-dits count for their declared surface (or a
    capped default); the rest of the surface carries the average of the
    non-grand-cru vines of the domain's communes. No plot is attributed.
    """
    cfg = ts.load_grid()["domaines"]
    located = [d for d in raw if d.get("lat") is not None and d.get("lon") is not None]
    if not located:
        return []
    v = v.copy()
    v["_com"] = v.commune_name.fillna("").map(_norm)
    v["_cru"] = v.grand_cru.map(lambda c: ts.fold(c) if isinstance(c, str) else None)
    rp = v.representative_point()
    xy = gpd.GeoSeries(gpd.points_from_xy([d["lon"] for d in located], [d["lat"] for d in located]),
                       crs=4326).to_crs(L93)

    out = []
    for d, cellar in zip(located, xy):
        surface = d.get("surface_ha")
        places, unresolved = resolve_places(d, v)
        ts.split_declared_total([p for p, _, _ in places], d.get("surface_grands_crus_ha"))

        communes = d.get("communes") or ([d["commune"]] if d.get("commune") else [])
        rest = v[v._com.isin({_norm(c) for c in communes}) & v._cru.isna()]
        if communes and rest.empty:
            print(f"  ! {d['id']} : aucune vigne hors grand cru dans {communes}")
        rest_sun = ts.weighted_mean(rest.score_sun, rest.area_ha)
        rest_cool = ts.weighted_mean(rest.score_cool, rest.area_ha)

        shares = ts.compose_domain(surface, [p for p, _, _ in places], rest_sun, rest_cool, cfg) if surface else []
        share_of = {s.name: s for s in shares}
        weight = pd.Series(0.0, index=v.index)  # each plot's part of the domain surface
        items = []
        for p, mask, info in places:
            s = share_of.get(p.name)
            if s and p.vine_ha:
                weight[mask] += s.area_ha * v.area_ha[mask] / p.vine_ha
            centre = _to_lonlat(rp[mask].union_all().centroid)
            items.append({
                "kind": p.kind, "name": p.name, **info,
                "area_ha": round(s.area_ha, 2) if s else None, "basis": s.basis if s else None,
                "vine_ha": round(p.vine_ha, 2), "score_sun": p.score_sun, "score_cool": p.score_cool,
                "distance_m": round(shapely.union_all(v.geometry[mask].values).distance(cellar)),
                "lon": round(centre.x, 5), "lat": round(centre.y, 5),
                "geometry": _geojson(shapely.union_all(v.geometry[mask].values)),
            })
        s = share_of.get("reste")
        if s:
            if len(rest):
                weight[rest.index] += s.area_ha * rest.area_ha / rest.area_ha.sum()
            items.append({"kind": "reste", "name": "reste", "communes": communes,
                          "area_ha": round(s.area_ha, 2), "basis": "reste",
                          "vine_ha": round(float(rest.area_ha.sum()), 2),
                          "score_sun": rest_sun, "score_cool": rest_cool})

        w = weight[weight > 0]
        fam = (v.loc[w.index].assign(w=w).groupby("geol_family").w.sum() / w.sum()).round(3) \
            .sort_values(ascending=False) if len(w) else pd.Series(dtype=float)
        alt = _weighted_median(v.loc[w.index, "altitude_m"], w) if len(w) else None
        slope = _weighted_median(v.loc[w.index, "slope_pct"], w) if len(w) else None
        sector = v[np.hypot(rp.x - cellar.x, rp.y - cellar.y) <= cfg["secteur_rayon_m"]]
        out.append({
            **{k: d.get(k) for k in ("id", "name", "commune", "insee", "lat", "lon", "coord_precision",
                                     "surface_ha", "surface_note", "grands_crus", "lieux_dits",
                                     "certification", "sources", "confidence")},
            "communes": communes,
            "composition": items,
            "unresolved_places": unresolved,
            "score_sun": ts.composed_score(shares, "score_sun") if shares else None,
            "score_cool": ts.composed_score(shares, "score_cool") if shares else None,
            "sector_score_sun": ts.weighted_mean(sector.score_sun, sector.area_ha),
            "sector_score_cool": ts.weighted_mean(sector.score_cool, sector.area_ha),
            "terroir": {
                "familles": fam.head(4).to_dict(),
                "altitude_med_m": round(alt) if alt is not None else None,
                "pente_med_pct": round(slope, 1) if slope is not None else None,
            },
            "score_confidence": ts.score_confidence(shares, surface, bool(d.get("communes")), d.get("confidence"))
            if shares else "basse",
        })
    return out


# ---------------------------------------------------------------------------
# Supabase
# ---------------------------------------------------------------------------
def _num(x: object) -> object:
    return None if x is None or (isinstance(x, float) and math.isnan(x)) else x


def plot_rows(v: gpd.GeoDataFrame) -> list[dict]:
    w = v.to_crs(4326)
    centers = v.representative_point().to_crs(4326)
    rows = []
    for r, c in zip(w.itertuples(), centers):
        rows.append({
            "id": r.id, "root_region_id": "alsace", "source": r.source, "source_ref": r.source_ref,
            "rpg_culture_code": r.code_cultu, "is_organic": _num(r.is_organic),
            "commune_insee": r.commune_insee, "commune_name": r.commune_name,
            "appellation": r.appellation, "grand_cru": r.grand_cru, "wine_area_id": r.wine_area_id,
            "lieu_dit": r.lieu_dit, "area_ha": r.area_ha,
            "center": geometry_to_ewkt(c, kind="point"), "geom": geometry_to_ewkt(r.geometry),
            "altitude_m": _num(r.altitude_m), "slope_pct": _num(r.slope_pct), "aspect_deg": _num(r.aspect_deg),
            "geol_notation": r.geol_notation, "geol_descr": r.geol_descr, "geol_family": r.geol_family,
            "geol_dominant_share": _num(r.geol_dominant_share), "soil_name": r.soil_name,
            "score_sun": r.score_sun, "score_cool": r.score_cool,
            "score_components": json.loads(r.score_components),
            "source_dataset_id": "ign-rpg" if r.source == "rpg" else "ign-bdtopo",
            "source_type": "real",
        })
    return [{k: (None if isinstance(x, float) and math.isnan(x) else x) for k, x in row.items()} for row in rows]


def domain_rows(domains: list[dict]) -> list[dict]:
    now = datetime.now(timezone.utc).isoformat()
    rows = []
    for d in domains:
        rows.append({
            "id": d["id"], "root_region_id": "alsace", "name": d["name"], "commune": d.get("commune"),
            "commune_insee": d.get("insee"),
            "location": f"SRID=4326;POINT({d['lon']} {d['lat']})", "coord_precision": d.get("coord_precision"),
            "surface_ha": d.get("surface_ha"), "surface_note": d.get("surface_note"),
            "grands_crus": d.get("grands_crus") or [], "lieux_dits": d.get("lieux_dits") or [],
            "certification": d.get("certification"), "sources": d.get("sources") or [],
            "source_confidence": d.get("confidence"),
            **{k: d[k] for k in ("communes", "composition", "unresolved_places", "score_sun", "score_cool",
                                 "sector_score_sun", "sector_score_cool", "terroir", "score_confidence")},
            "source_type": "manual", "computed_at": now,
        })
    return rows


def _request(method: str, url: str, key: str, body: object | None = None) -> None:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=_headers(key), method=method)
    with urllib.request.urlopen(req, timeout=600, context=SSL_CTX) as r:
        r.read()


def _get_rows(url: str, key: str, path: str, page: int = 1000) -> list[dict]:
    rows: list[dict] = []
    while True:
        headers = {**_headers(key), "Range": f"{len(rows)}-{len(rows) + page - 1}"}
        req = urllib.request.Request(f"{url}/{path}", headers=headers)
        with urllib.request.urlopen(req, timeout=600, context=SSL_CTX) as r:
            batch = json.load(r)
        rows += batch
        if len(batch) < page:
            return rows


def clip_lieux_dits(ld: gpd.GeoDataFrame, v: gpd.GeoDataFrame) -> tuple[gpd.GeoDataFrame, list[str]]:
    """Reduce each lieu-dit to its planted part (ADR 0017).

    A cadastral lieu-dit spans forest, houses and meadows as well as vines: the
    map would fill all of it. Keep ``lieu-dit ∩ vines`` minus slivers along the
    boundaries; a lieu-dit left with less than LIEU_MIN_VINE_M2 is dropped.
    Returns (clipped rows, ids to delete). Clipping an already clipped lieu-dit
    is a no-op, so a re-run is safe.
    """
    vg = v.geometry.values
    l_idx, v_idx = v.sindex.query(ld.geometry.values, predicate="intersects")
    geoms = np.full(len(ld), None, dtype=object)
    for i in np.unique(l_idx):
        piece = ld.geometry.values[i].intersection(shapely.union_all(vg[v_idx[l_idx == i]]))
        parts = [p for p in getattr(piece, "geoms", [piece])
                 if p.geom_type == "Polygon" and p.area >= LIEU_MIN_PART_M2
                 and not p.buffer(-LIEU_SLIVER_M).is_empty]
        if parts and sum(p.area for p in parts) >= LIEU_MIN_VINE_M2:
            geoms[i] = shapely.MultiPolygon(parts).simplify(1.0)
    keep = np.array([g is not None and not g.is_empty for g in geoms])
    out = ld[keep].copy()
    out["geometry"] = list(geoms[keep])
    return out, ld.loc[~keep, "id"].tolist()


def prune_lieux_dits(v: gpd.GeoDataFrame, url: str, key: str) -> int:
    base = url.rstrip("/") + "/rest/v1"
    rows = _get_rows(base, key, "wine_lieux_dits?select=*&or=(commune_insee.like.67*,commune_insee.like.68*)&order=id")
    if not rows:
        return 0
    ld = gpd.GeoDataFrame(rows, geometry=[shapely.geometry.shape(r["geom"]) for r in rows], crs=4326).to_crs(L93)
    ld["geometry"] = ld.geometry.make_valid()
    before = ld.area.sum() / 1e4
    clipped, gone = clip_lieux_dits(ld, v)
    print(f"lieux-dits : {len(ld)} → {len(clipped)} ({before:.0f} ha → {clipped.area.sum() / 1e4:.0f} ha plantés)")
    for i in range(0, len(gone), 150):
        ids = ",".join(f'"{x}"' for x in gone[i:i + 150])
        _request("DELETE", f"{base}/wine_lieux_dits?id=in.({urllib.parse.quote(ids)})", key)
    w = clipped.to_crs(4326)
    centers = clipped.representative_point().to_crs(4326)
    now = datetime.now(timezone.utc).isoformat()
    out = []
    for r, g, c in zip(rows_by_id(rows, w["id"]), w.geometry, centers):
        out.append({**r, "geom": geometry_to_ewkt(g), "center": geometry_to_ewkt(c, kind="point"), "updated_at": now})
    _, err = upsert_rows("wine_lieux_dits", "id", out, url, key, 200)
    print(f"table=wine_lieux_dits clipped={len(out)} deleted={len(gone)} errors={err}")
    return 1 if err else 0


def rows_by_id(rows: list[dict], ids: pd.Series) -> list[dict]:
    by_id = {r["id"]: r for r in rows}
    return [by_id[i] for i in ids]


def commit(v: gpd.GeoDataFrame | None, domains: list[dict], prune: bool) -> int:
    """Replace the derived Alsace rows (``v`` None: the domains only)."""
    _load_project_env()
    url, key = _resolve_env()
    if not url or not key:
        print("ERROR: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants", file=sys.stderr)
        return 1
    base = url.rstrip("/") + "/rest/v1"
    # Full replace: a re-run with a newer RPG or domain list must not leave
    # plots or domains that no longer exist.
    _request("DELETE", f"{base}/wine_domains?root_region_id=eq.alsace", key)
    w, e1 = upsert_rows("wine_domains", "id", domain_rows(domains), url, key, 50)
    print(f"table=wine_domains upserted={w} errors={e1}")
    if v is None:
        return 1 if e1 else 0
    _request("DELETE", f"{base}/vine_plots?root_region_id=eq.alsace", key)
    w, e2 = upsert_rows("vine_plots", "id", plot_rows(v), url, key, 500)
    print(f"table=vine_plots upserted={w} errors={e2}")
    if e1 or e2:
        return 1
    if prune:
        _request("POST", f"{base}/rpc/prune_alsace_vineless_geodata", key, {})
        print("prune: aires INAO « parcelles » et lieux-dits sans vigne supprimés (Alsace)")
        return prune_lieux_dits(v, url, key)
    return 0


def print_domains(domains: list[dict]) -> None:
    print("\nDomaines (score composé · secteur 1,5 km · confiance)")
    for d in sorted(domains, key=lambda d: -(d["score_sun"] or 0)):
        named = sum(i["area_ha"] or 0 for i in d["composition"] if i["kind"] != "reste")
        print(f"  {d['name'][:34]:34} {d['surface_ha'] or 0:6.1f} ha  lieux nommés {named:5.1f} ha"
              f"  score {d['score_sun']}  secteur {d['sector_score_sun']}  [{d['score_confidence']}]"
              + (f"  non localisés : {', '.join(d['unresolved_places'])}" if d["unresolved_places"] else ""))


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--refresh", action="store_true", help="re-télécharge RPG / BD TOPO / sols / relief")
    ap.add_argument("--commit", action="store_true", help="remplace vine_plots et wine_domains (Alsace)")
    ap.add_argument("--prune", action="store_true", help="avec --commit : supprime les aires INAO et lieux-dits sans vigne")
    ap.add_argument("--lieux-dits-only", action="store_true",
                    help="découpe seulement les lieux-dits sur les vignes déjà construites (cache), sans réécrire vine_plots")
    ap.add_argument("--domains-only", action="store_true",
                    help="recalcule seulement les domaines à partir des vignes en cache (avec --commit : réécrit wine_domains)")
    args = ap.parse_args(argv)

    if args.lieux_dits_only:
        _load_project_env()
        url, key = _resolve_env()
        if not url or not key:
            print("ERROR: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants", file=sys.stderr)
            return 1
        return prune_lieux_dits(gpd.read_file(CACHE / "vine_plots.gpkg").to_crs(L93), url, key)

    if args.domains_only:
        v = gpd.read_file(CACHE / "vine_plots.gpkg").to_crs(L93)
        v = v.drop(columns=[c for c in ("domain_id", "domain_distance_m", "domain_via_cru") if c in v])
    else:
        v = build_plots(args.refresh)
        v.to_crs(4326).to_file(CACHE / "vine_plots.gpkg", driver="GPKG")
    domains = build_domains(v, load_domains())
    (CACHE / "domains.json").write_text(json.dumps(domains, ensure_ascii=False, indent=1), encoding="utf-8")
    print_domains(domains)
    if args.domains_only:
        if args.commit:
            return commit(None, domains, False)
        print("\nDry-run : rien n'est écrit dans Supabase (ajouter --commit).")
        return 0

    print(f"\n{len(v)} vignes, {v.area_ha.sum():.0f} ha "
          f"(RPG {v[v.source == 'rpg'].area_ha.sum():.0f} ha, BD TOPO {v[v.source == 'bdtopo'].area_ha.sum():.0f} ha)")
    print(f"score soleil médian {v.score_sun.median():.1f} · grands crus {v[v.grand_cru.notna()].score_sun.median():.1f}"
          f" · hors GC {v[v.grand_cru.isna()].score_sun.median():.1f}")
    print(v.groupby("geol_family").area_ha.sum().sort_values(ascending=False).head(10).round(0).to_string())
    if args.commit:
        return commit(v, domains, args.prune)
    print("\nDry-run : rien n'est écrit dans Supabase (ajouter --commit).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
