#!/usr/bin/env python3
"""Tests for the terroir score and the domain score composition (no I/O)."""

from __future__ import annotations

import unittest

import terroir_score as ts

GRID = ts.load_grid()
CFG = GRID["domaines"]


class TestRockFamily(unittest.TestCase):
    def test_superficial_cover_beats_bedrock_named_later(self) -> None:
        self.assertEqual(ts.rock_family("Éboulis calcaires sur marnes"), "eboulis")

    def test_first_named_lithology_wins(self) -> None:
        self.assertEqual(ts.rock_family("Calcaires et marnes à Teloceras"), "calcaire")
        self.assertEqual(ts.rock_family("Marnes gréseuses bariolées à gypse"), "marne")

    def test_alsace_crus(self) -> None:
        # Steinert, Rangen, Brand (ADR 0014 checks)
        self.assertEqual(ts.rock_family("Grande oolithe et marnes à acuminata (Bajocien supérieur)"), "calcaire")
        self.assertEqual(ts.rock_family("Tufs rhyolitiques, ignimbrites (Viséen supérieur)"), "volcanique")
        self.assertEqual(ts.rock_family("Granite des Trois-Épis"), "granite")
        self.assertEqual(ts.rock_family("Lœss"), "loess")

    def test_unknown(self) -> None:
        self.assertEqual(ts.rock_family(None), "autre")
        self.assertEqual(ts.rock_family("Formation indéterminée"), "autre")


class TestScore(unittest.TestCase):
    def test_sector(self) -> None:
        self.assertEqual(ts.sector(0), "N")
        self.assertEqual(ts.sector(180), "S")
        self.assertEqual(ts.sector(350), "N")
        self.assertIsNone(ts.sector(None))

    def test_flat_plot_ignores_aspect(self) -> None:
        plot = {"geol_family": "calcaire", "slope_pct": 1.0, "aspect_deg": 180, "altitude_m": 300}
        c = ts.components(plot, GRID, "soleil")
        self.assertEqual(c["exposition"], GRID["exposition"]["plat"])

    def test_south_slope_beats_plain(self) -> None:
        coteau = {"geol_family": "granite", "slope_pct": 25, "aspect_deg": 160, "altitude_m": 330,
                  "soil_name": "RANKOSOL"}
        plaine = {"geol_family": "alluvions", "slope_pct": 0.5, "aspect_deg": 90, "altitude_m": 180,
                  "soil_name": "FLUVIOSOL"}
        self.assertGreater(ts.score(coteau, GRID, "soleil"), 85)
        self.assertLess(ts.score(plaine, GRID, "soleil"), 40)

    def test_modes_differ_only_on_exposition(self) -> None:
        plot = {"geol_family": "calcaire", "slope_pct": 20, "aspect_deg": 0, "altitude_m": 300}
        a, b = ts.components(plot, GRID, "soleil"), ts.components(plot, GRID, "fraicheur")
        self.assertLess(a["exposition"], b["exposition"])
        self.assertEqual({k: v for k, v in a.items() if k != "exposition"},
                         {k: v for k, v in b.items() if k != "exposition"})

    def test_soil_lookup_takes_first_word(self) -> None:
        self.assertEqual(ts.soil_value("CALCOSOL typique", GRID), GRID["sol"]["CALCOSOL"])
        self.assertEqual(ts.soil_value(None, GRID), GRID["sol"]["_defaut"])


class TestDomainComposition(unittest.TestCase):
    def place(self, name: str, vine_ha: float, sun: float, declared: float | None = None,
              kind: str = "grand_cru") -> ts.Place:
        return ts.Place(kind, name, vine_ha, sun, sun, declared)

    def test_zind_humbrecht_like(self) -> None:
        # Rangen declared 5.5 ha, Brand unknown (default), rest at the communes average
        places = [self.place("Rangen", 16.9, 82.4, 5.5), self.place("Brand", 44.3, 88.2)]
        shares = ts.compose_domain(40.0, places, 66.0, 66.0, CFG)
        by = {s.name: s for s in shares}
        self.assertEqual(by["Rangen"].basis, "declaree")
        self.assertAlmostEqual(by["Rangen"].area_ha, 5.5)
        default = min(CFG["part_max_lieu"] * 44.3, CFG["part_max_domaine"] * 40)
        self.assertAlmostEqual(by["Brand"].area_ha, default)
        self.assertAlmostEqual(by["reste"].area_ha, 40 - 5.5 - default)
        self.assertAlmostEqual(sum(s.area_ha for s in shares), 40.0)
        expected = (5.5 * 82.4 + default * 88.2 + (40 - 5.5 - default) * 66.0) / 40
        self.assertAlmostEqual(ts.composed_score(shares, "score_sun"), round(expected, 1))

    def test_declared_surface_capped_by_planted_vines(self) -> None:
        shares = ts.compose_domain(10.0, [self.place("Clos", 2.0, 90, 5.0, "lieu_dit")], 60, 60, CFG)
        self.assertAlmostEqual(shares[0].area_ha, 2.0)

    def test_places_beyond_surface_are_scaled_down(self) -> None:
        places = [self.place("A", 50, 90, 8.0), self.place("B", 50, 80, 8.0)]
        shares = ts.compose_domain(10.0, places, 50, 50, CFG)
        self.assertEqual([s.name for s in shares], ["A", "B"])  # no rest left
        self.assertAlmostEqual(sum(s.area_ha for s in shares), 10.0)

    def test_split_declared_total_only_fills_unknown_crus(self) -> None:
        places = [self.place("A", 50, 90, 4.0), self.place("B", 50, 80), self.place("C", 50, 80),
                  self.place("L", 5, 70, kind="lieu_dit")]
        ts.split_declared_total(places, 10.0)
        self.assertEqual([p.declared_ha for p in places], [4.0, 3.0, 3.0, None])
        self.assertEqual(places[1].basis, "repartie")

    def test_no_rest_score_leaves_places_only(self) -> None:
        shares = ts.compose_domain(10.0, [self.place("A", 40, 90, 2.0)], None, None, CFG)
        self.assertEqual(ts.composed_score(shares, "score_sun"), 90.0)


class TestConfidence(unittest.TestCase):
    def test_levels(self) -> None:
        known = [ts.Share("grand_cru", "A", 6, "declaree", 90, 90), ts.Share("reste", "reste", 4, "reste", 60, 60)]
        guessed = [ts.Share("grand_cru", "A", 1, "defaut", 90, 90), ts.Share("reste", "reste", 9, "reste", 60, 60)]
        self.assertEqual(ts.score_confidence(known, 10, True, "haute"), "haute")
        self.assertEqual(ts.score_confidence(guessed, 10, False, "moyenne"), "basse")
        self.assertEqual(ts.score_confidence(guessed, 10, True, "haute"), "moyenne")


if __name__ == "__main__":
    unittest.main()
