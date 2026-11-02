#!/usr/bin/env python3
"""Tests for the terroir score and the plot → domain assignment (no I/O)."""

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


class TestAssignment(unittest.TestCase):
    def test_reach_grows_with_size_and_is_clamped(self) -> None:
        rule = CFG["distance_max_km"]
        self.assertLess(ts.max_distance_m(5, rule), ts.max_distance_m(40, rule))
        self.assertEqual(ts.max_distance_m(0.5, rule), rule["min"] * 1000)
        self.assertEqual(ts.max_distance_m(1000, rule), rule["max"] * 1000)

    def test_stops_at_target_share(self) -> None:
        plots = [ts.Plot(f"p{i}", 100.0 * i, 0, 1.0) for i in range(1, 30)]
        d = ts.Domain("d", 0, 0, 10.0)
        got = ts.assign_domains(plots, [d], CFG)
        self.assertEqual(len(got), 8)  # 80 % of 10 ha, 1 ha plots
        self.assertEqual([a.plot_id for a in got], [f"p{i}" for i in range(1, 9)])  # nearest first

    def test_never_beyond_reach(self) -> None:
        plots = [ts.Plot("far", 50_000, 0, 1.0)]
        self.assertEqual(ts.assign_domains(plots, [ts.Domain("d", 0, 0, 10.0)], CFG), [])

    def test_plot_goes_to_one_domain_only(self) -> None:
        plots = [ts.Plot("p", 500, 0, 1.0)]
        doms = [ts.Domain("a", 0, 0, 10.0), ts.Domain("b", 400, 0, 10.0)]
        got = ts.assign_domains(plots, doms, CFG)
        self.assertEqual([(a.plot_id, a.domain_id) for a in got], [("p", "b")])

    def test_declared_cru_far_away_is_claimed_but_capped(self) -> None:
        cru = [ts.Plot(f"r{i}", 20_000, 10.0 * i, 0.5, "rangen") for i in range(40)]  # 20 ha cru, 20 km away
        d = ts.Domain("zh", 0, 0, 40.0, frozenset({"rangen"}))
        got = ts.assign_domains(cru, [d], CFG)
        self.assertTrue(all(a.via_cru for a in got))
        cap = min(CFG["cru_declare"]["part_max_cru"] * 20, CFG["cru_declare"]["part_max_domaine"] * 40)
        self.assertLessEqual(0.5 * len(got), cap + 0.25)
        self.assertGreater(len(got), 0)

    def test_domain_without_surface_gets_nothing(self) -> None:
        plots = [ts.Plot("p", 10, 0, 1.0)]
        self.assertEqual(ts.assign_domains(plots, [ts.Domain("d", 0, 0, None)], CFG), [])


class TestConfidence(unittest.TestCase):
    def test_levels(self) -> None:
        self.assertEqual(ts.assignment_confidence(0.8, "adresse", "haute"), "haute")
        self.assertEqual(ts.assignment_confidence(0.8, "commune", "moyenne"), "moyenne")
        self.assertEqual(ts.assignment_confidence(0.2, "commune", "basse"), "basse")


if __name__ == "__main__":
    unittest.main()
