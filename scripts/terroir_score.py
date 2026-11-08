"""Terroir score of a planted vine plot, and estimated score of a reference domain.

Pure functions only (no I/O beyond reading the grid), so they can be unit-tested
and reused by any region. The grid lives in ``src/data/terroir-score-alsace.json``
and is shared with the frontend (``src/lib/terroir-score.ts``): change the
weights there, never here. Methodology: ``docs/terroir-score.md`` (ADR 0016).

Score (0-100) = weighted mean of five components in [0, 1]:

    geologie    BD Charm-50 rock family of the dominant formation under the plot
    exposition  aspect sector (8 sectors), "plat" under ``plat_pente_max`` %
    pente       slope step table
    altitude    altitude step table
    sol         INRAE RRP dominant soil type (1/250 000)

Two readings of the exposition: ``soleil`` (sun-seeking, the classic Alsace
reading) and ``fraicheur`` (north-facing favoured, a climate-change reading).
"""
from __future__ import annotations

import json
import math
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Optional

ROOT = Path(__file__).resolve().parents[1]
GRID_PATH = ROOT / "src" / "data" / "terroir-score-alsace.json"
SECTORS = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"]
MODES = ("soleil", "fraicheur")


def load_grid(path: Path = GRID_PATH) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


# ---------------------------------------------------------------------------
# Rock family — Python twin of src/lib/geology-formation.ts (matchFamily).
# Same regexes, same rule: superficial formations listed first, earliest match
# in the accent-folded label wins, list order breaks ties. Keys are the grid's.
# ---------------------------------------------------------------------------
FAMILIES: list[tuple[str, str]] = [
    # superficial cover — what the vine actually roots in
    ("eboulis", r"eboulis|cryoclaste"),
    ("solifluxion", r"soliflu"),
    ("colluvions", r"colluvion"),
    ("alluvions", r"alluvion"),
    ("loess", r"loess|lehm"),
    ("cailloutis", r"cone[s]? (de dejection|alluvi)|cailloutis|glacis|terrasse|epandage"),
    ("limons", r"limon"),
    ("eau", r"hydrographie|plan d.eau|eau libre"),
    ("glaciaire", r"moraine|glaciaire"),
    ("tourbe", r"tourbe"),
    ("remblais", r"remblai|anthropique"),
    # bedrock
    ("travertin", r"travertin|tuf calcaire|tufs calcaires"),
    ("craie", r"craie"),
    ("calcaire", r"oolith|calcaire|calcareu|dolomi|muschelkalk"),
    ("marne", r"marne|marno"),
    ("marnes_gypse", r"gypse|anhydrite|evaporite|salifere|keuper"),
    ("conglomerat", r"conglomerat|poudingue|gompholite"),
    ("gres", r"gres|arkose|buntsandstein|voltzia"),
    ("argile", r"argil"),
    ("sable", r"sable|sablon"),
    ("volcanique", r"rhyolit|ignimbrit|basalt|andesit|trachyt|latite|pyromerid|volcan|spilite|\btufs?\b"),
    ("granite", r"granit|granodiorit"),
    ("magmatique", r"gabbro|diorit|syenit|peridotit"),
    ("gneiss", r"migmatit|gneiss"),
    ("micaschiste", r"micaschiste"),
    ("schiste", r"schiste|ardois|phyllade"),
    ("grauwacke", r"grauwacke"),
    ("gaize", r"gaize"),
    ("breche", r"breche|mylonite"),
    ("quartzite", r"quartzit"),
    ("metamorphique_basique", r"amphibolit|serpentinit"),
]
_FAMILY_RX = [(key, re.compile(rx)) for key, rx in FAMILIES]


def fold(text: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn"
    ).lower().replace("œ", "oe")


def rock_family(descr: Optional[str]) -> str:
    """Grid key of the rock family a BD Charm-50 label describes ("autre" if none)."""
    if not descr:
        return "autre"
    folded = fold(descr)
    best, at = "autre", None
    for key, rx in _FAMILY_RX:
        m = rx.search(folded)
        if m and (at is None or m.start() < at):
            best, at = key, m.start()
    return best


# ---------------------------------------------------------------------------
# Score
# ---------------------------------------------------------------------------
def sector(deg: Optional[float]) -> Optional[str]:
    if deg is None or (isinstance(deg, float) and math.isnan(deg)):
        return None
    return SECTORS[int(((deg % 360) + 22.5) // 45) % 8]


def step(x: Optional[float], table: list) -> float:
    """Value of the first row whose upper bound is above ``x`` (0.5 if unknown)."""
    if x is None or (isinstance(x, float) and math.isnan(x)):
        return 0.5
    for limit, value in table:
        if x < limit:
            return float(value)
    return float(table[-1][1])


def soil_value(soil: Optional[str], grid: dict) -> float:
    if not soil:
        return float(grid["sol"]["_defaut"])
    head = fold(str(soil)).upper().split()[0].strip(",;")
    return float(grid["sol"].get(head, grid["sol"]["_defaut"]))


def geology_value(plot: dict, grid: dict) -> float:
    """Rock-family value, unless a label motif of the grid matches first.

    ``geologie_motifs`` (optional, ordered ``[regex, value]`` pairs on the
    accent-folded BD Charm-50 label) carries the stages that make a local
    terroir and that the rock family cannot tell apart, e.g. Kimmeridgian
    against Portlandian in Chablis (mode op A3).
    """
    descr = plot.get("geol_descr")
    if isinstance(descr, str) and descr:
        folded = fold(descr)
        for rx, value in grid.get("geologie_motifs") or []:
            if re.search(rx, folded):
                return float(value)
    return float(grid["geologie"].get(plot.get("geol_family") or "autre", grid["geologie"]["autre"]))


def altitude_table(plot: dict, grid: dict) -> list:
    """The sector's altitude table (``altitude_secteurs``) or the region's (mode op A2)."""
    return (grid.get("altitude_secteurs") or {}).get(plot.get("secteur") or "", grid["altitude"])


def components(plot: dict, grid: dict, mode: str) -> dict[str, float]:
    """The five criteria of one plot, each in [0, 1].

    ``plot`` keys: geol_family, slope_pct, aspect_deg, altitude_m, soil_name;
    optional geol_descr (label motifs) and secteur (sector altitude table).
    """
    expo = grid["exposition"]
    slope = plot.get("slope_pct")
    flat = slope is None or (isinstance(slope, float) and math.isnan(slope)) or slope < expo["plat_pente_max"]
    sec = sector(plot.get("aspect_deg"))
    return {
        "geologie": geology_value(plot, grid),
        "exposition": float(expo["plat"] if flat or sec is None else expo[mode][sec]),
        "pente": step(slope, grid["pente"]),
        "altitude": step(plot.get("altitude_m"), altitude_table(plot, grid)),
        "sol": soil_value(plot.get("soil_name"), grid),
    }


def weighted(comp: dict[str, float], weights: dict[str, float]) -> float:
    total = sum(weights.values())
    if not total:
        return 0.0
    return round(100 * sum(weights[k] * comp[k] for k in weights) / total, 1)


def score(plot: dict, grid: dict, mode: str) -> float:
    return weighted(components(plot, grid, mode), grid["poids"])


# ---------------------------------------------------------------------------
# Domain score: declared places + communes average (ADR 0019)
# ---------------------------------------------------------------------------
@dataclass
class Place:
    """A grand cru or lieu-dit a domain declares, resolved to planted vines."""
    kind: str                       # "grand_cru" | "premier_cru" | "village" | "lieu_dit"
    name: str
    vine_ha: float                  # planted vines of the place (all owners)
    score_sun: Optional[float]
    score_cool: Optional[float]
    declared_ha: Optional[float] = None
    basis: str = "declaree"         # how declared_ha was obtained: declaree | repartie


@dataclass
class Share:
    """One slice of a domain's surface and the score it carries."""
    kind: str                       # "grand_cru" | "lieu_dit" | "reste"
    name: str
    area_ha: float
    basis: str                      # declaree | repartie | defaut | reste
    score_sun: Optional[float]
    score_cool: Optional[float]


def split_declared_total(places: list[Place], total_ha: Optional[float]) -> None:
    """Spread a declared grand-cru total ("~70 ha en grands crus") evenly over
    the declared grands crus that have no surface of their own (in place)."""
    if not total_ha:
        return
    known = sum(p.declared_ha or 0 for p in places if p.kind == "grand_cru")
    todo = [p for p in places if p.kind == "grand_cru" and p.declared_ha is None]
    left = total_ha - known
    if not todo or left <= 0:
        return
    for p in todo:
        p.declared_ha = left / len(todo)
        p.basis = "repartie"


def place_area_ha(p: Place, surface_ha: float, cfg: dict) -> tuple[float, str]:
    """Surface of a declared place counted in the domain, and its basis.

    A declared surface is kept, capped by the vines actually planted there.
    Otherwise a default: ``part_max_lieu`` of the place (a cru shared by dozens
    of growers) and at most ``part_max_domaine`` of the domain.
    """
    if p.declared_ha is not None:
        return min(p.declared_ha, p.vine_ha), p.basis
    return min(cfg["part_max_lieu"] * p.vine_ha, cfg["part_max_domaine"] * surface_ha), "defaut"


def compose_domain(surface_ha: float, places: list[Place], rest_sun: Optional[float],
                   rest_cool: Optional[float], cfg: dict) -> list[Share]:
    """Split a domain's declared surface between its declared places and the rest.

    The rest — vines the domain does not name — carries the average of the
    non-grand-cru vines of the communes where the domain grows: an expected
    value, not the plots nearest the cellar, which in Alsace are the plain
    around the village. Places exceeding the surface are scaled down together.
    """
    shares = []
    for p in places:
        area, basis = place_area_ha(p, surface_ha, cfg)
        if area > 0:
            shares.append(Share(p.kind, p.name, area, basis, p.score_sun, p.score_cool))
    claimed = sum(s.area_ha for s in shares)
    if claimed > surface_ha:
        for s in shares:
            s.area_ha *= surface_ha / claimed
        claimed = surface_ha
    if surface_ha - claimed > 1e-9:
        shares.append(Share("reste", "reste", surface_ha - claimed, "reste", rest_sun, rest_cool))
    return shares


def composed_score(shares: list[Share], attr: str) -> Optional[float]:
    return weighted_mean([getattr(s, attr) for s in shares], [s.area_ha for s in shares])


def weighted_mean(values: Iterable[float], weights: Iterable[float]) -> Optional[float]:
    num = den = 0.0
    for v, w in zip(values, weights):
        if v is None or (isinstance(v, float) and math.isnan(v)):
            continue
        num += v * w
        den += w
    return round(num / den, 1) if den else None


def score_confidence(shares: list[Share], surface_ha: float, communes_declared: bool,
                     source_confidence: Optional[str]) -> str:
    """Readable confidence of a composed score ("haute" | "moyenne" | "basse").

    Counts how much of the surface rests on declared surfaces rather than on
    defaults or the communes average, whether the communes are declared, and
    how well sourced the domain sheet is.
    """
    known = sum(s.area_ha for s in shares if s.basis in ("declaree", "repartie")) / surface_ha
    pts = 2 if known >= 0.5 else 1 if known >= 0.15 else 0
    pts += 1 if communes_declared else 0
    pts += {"haute": 2, "moyenne": 1}.get(source_confidence or "", 0)
    return "haute" if pts >= 4 else "moyenne" if pts >= 2 else "basse"
