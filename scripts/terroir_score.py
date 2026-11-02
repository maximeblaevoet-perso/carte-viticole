"""Terroir score of a planted vine plot, and estimated plot → domain assignment.

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

import heapq
import json
import math
import re
import unicodedata
from dataclasses import dataclass, field
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


def components(plot: dict, grid: dict, mode: str) -> dict[str, float]:
    """The five criteria of one plot, each in [0, 1].

    ``plot`` keys: geol_family, slope_pct, aspect_deg, altitude_m, soil_name.
    """
    expo = grid["exposition"]
    slope = plot.get("slope_pct")
    flat = slope is None or (isinstance(slope, float) and math.isnan(slope)) or slope < expo["plat_pente_max"]
    sec = sector(plot.get("aspect_deg"))
    return {
        "geologie": float(grid["geologie"].get(plot.get("geol_family") or "autre", grid["geologie"]["autre"])),
        "exposition": float(expo["plat"] if flat or sec is None else expo[mode][sec]),
        "pente": step(slope, grid["pente"]),
        "altitude": step(plot.get("altitude_m"), grid["altitude"]),
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
# Domain assignment
# ---------------------------------------------------------------------------
@dataclass
class Plot:
    id: str
    x: float          # Lambert-93 metres
    y: float
    area_ha: float
    cru: Optional[str] = None   # grand cru name (as in the domain list), if any


@dataclass
class Domain:
    id: str
    x: float
    y: float
    surface_ha: Optional[float]
    crus: frozenset = field(default_factory=frozenset)


@dataclass
class Assignment:
    plot_id: str
    domain_id: str
    distance_m: float
    via_cru: bool


def max_distance_m(surface_ha: float, rule: dict) -> float:
    """Reach of a domain around its cellar: grows with the square root of its size.

    A 10 ha estate looks within ``base`` km; a 40 ha one twice as far — the
    area of a disc scales with r², so this keeps the *density* of the estate's
    land around the cellar comparable. Clamped to [min, max].
    """
    km = rule["base"] * math.sqrt(max(surface_ha, 0.1) / rule["surface_ref_ha"])
    return 1000 * min(rule["max"], max(rule["min"], km))


def assign_domains(plots: list[Plot], domains: list[Domain], cfg: dict) -> list[Assignment]:
    """Allocate plots to domains until each reaches ``part_cible`` of its surface.

    One global queue of (cost, domain, plot) candidates, cheapest first; a plot
    goes to the first domain that claims it while that domain is still below
    target. Cost is the cellar distance divided by the domain's own reach, so a
    130 ha house and a 6 ha grower compete on equal terms in the same village.

    Declared grands crus (``Domain.crus``) are claimed first (cost discounted by
    ``remise_cout``) up to ``distance_max_km`` — a Turckheim estate really does
    farm the Rangen 25 km away — but capped per cru, so no listed domain
    swallows a cru that dozens of growers share:
    ``min(part_max_cru × cru vine area, part_max_domaine × domain surface)``.

    Never extrapolates beyond the reach: a domain whose surroundings are taken
    or unplanted ends below target, and its coverage says so.
    """
    target_share = cfg["part_cible"]
    reach_rule = cfg["distance_max_km"]
    cru_rule = cfg["cru_declare"]

    cru_area: dict[str, float] = {}
    for p in plots:
        if p.cru:
            cru_area[p.cru] = cru_area.get(p.cru, 0.0) + p.area_ha

    heap: list[tuple[float, int, str, int, float, bool]] = []
    serial = 0
    by_id = {d.id: d for d in domains}
    for d in domains:
        if not d.surface_ha or d.surface_ha <= 0:
            continue
        reach = max_distance_m(d.surface_ha, reach_rule)
        cru_reach = 1000 * cru_rule["distance_max_km"]
        for i, p in enumerate(plots):
            dist = math.hypot(p.x - d.x, p.y - d.y)
            via_cru = bool(p.cru and p.cru in d.crus)
            if via_cru and dist <= cru_reach:
                cost = cru_rule["remise_cout"] * dist / cru_reach
            elif dist <= reach:
                cost = dist / reach
                via_cru = False
            else:
                continue
            heapq.heappush(heap, (cost, serial, d.id, i, dist, via_cru))
            serial += 1

    target = {d.id: target_share * d.surface_ha for d in domains if d.surface_ha}
    got = {d_id: 0.0 for d_id in target}
    cru_got: dict[tuple[str, str], float] = {}
    taken: set[int] = set()
    out: list[Assignment] = []
    while heap:
        _, _, d_id, i, dist, via_cru = heapq.heappop(heap)
        if i in taken:
            continue
        p = plots[i]
        # stop at target; accept a last plot if it lands closer to it than not,
        # but never beyond the declared surface (large RPG plots)
        if (got[d_id] + p.area_ha / 2 > target[d_id]
                or got[d_id] + p.area_ha > by_id[d_id].surface_ha):
            continue
        if via_cru:
            key = (d_id, p.cru)
            cap = min(cru_rule["part_max_cru"] * cru_area[p.cru],
                      cru_rule["part_max_domaine"] * by_id[d_id].surface_ha)
            if cru_got.get(key, 0.0) + p.area_ha / 2 > cap:
                continue
            cru_got[key] = cru_got.get(key, 0.0) + p.area_ha
        taken.add(i)
        got[d_id] += p.area_ha
        out.append(Assignment(p.id, d_id, round(dist, 1), via_cru))
    return out


def weighted_mean(values: Iterable[float], weights: Iterable[float]) -> Optional[float]:
    num = den = 0.0
    for v, w in zip(values, weights):
        if v is None or (isinstance(v, float) and math.isnan(v)):
            continue
        num += v * w
        den += w
    return round(num / den, 1) if den else None


def assignment_confidence(coverage: float, coord_precision: Optional[str],
                          source_confidence: Optional[str]) -> str:
    """Readable confidence of an estimated plot set ("haute" | "moyenne" | "basse")."""
    pts = 0
    pts += 2 if coverage >= 0.75 else 1 if coverage >= 0.4 else 0
    pts += 1 if coord_precision == "adresse" else 0
    pts += {"haute": 2, "moyenne": 1}.get(source_confidence or "", 0)
    return "haute" if pts >= 4 else "moyenne" if pts >= 2 else "basse"
