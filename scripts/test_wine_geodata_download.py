#!/usr/bin/env python3
"""Tests for wine geodata download helpers (API parsing, no large downloads)."""

from __future__ import annotations

import unittest

from wine_geodata_download import (
    ResourceInfo,
    fetch_datagouv_resources,
    pick_csv_resource,
    pick_national_geo_resource,
)


class TestDataGouvPicking(unittest.TestCase):
    def test_pick_csv(self) -> None:
        resources = [
            ResourceInfo("1", "old.csv", "http://x/old.csv", "csv", 100, None),
            ResourceInfo("2", "new.csv", "http://x/new.csv", "csv", 500000, None),
        ]
        picked = pick_csv_resource(resources)
        assert picked is not None
        self.assertEqual(picked.title, "new.csv")

    def test_pick_national_geo_skips_martinique(self) -> None:
        resources = [
            ResourceInfo(
                "1",
                "2020-11-25-rhum-de-martinique.zip",
                "http://x/rhum.zip",
                "zip",
                1_800_000,
                None,
            ),
            ResourceInfo(
                "2",
                "2026-06-29-delim-parcellaire-aoc-shp.zip",
                "http://x/parcellaire.zip",
                "zip",
                267_000_000,
                None,
            ),
        ]
        picked = pick_national_geo_resource(resources)
        assert picked is not None
        self.assertIn("parcellaire", picked.title)

    def test_fetch_inao_siqo_api(self) -> None:
        """Live API smoke test (metadata only, no file download)."""
        meta, resources = fetch_datagouv_resources(
            "referentiel-des-produits-sous-signe-officiel-didentification-de-la-"
            "qualite-et-de-lorigine-siqo"
        )
        self.assertIn("SIQO", meta.get("title", ""))
        csv = pick_csv_resource(resources)
        self.assertIsNotNone(csv)
        assert csv is not None
        self.assertTrue(csv.url.startswith("https://"))


if __name__ == "__main__":
    unittest.main()
