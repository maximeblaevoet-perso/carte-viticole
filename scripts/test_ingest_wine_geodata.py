#!/usr/bin/env python3
"""Unit tests for wine geodata ingestion helpers (no network, no Supabase)."""

from __future__ import annotations

import unittest
from pathlib import Path

from ingest_wine_geodata import (
    build_column_map,
    build_source_dataset_rows,
    centroid_lon_lat,
    geometry_to_ewkt,
    load_geodata,
    run_scope,
    slugify,
    stable_parcel_id,
    to_multipolygon,
)

FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures" / "wine-geodata"


class TestSlugAndIds(unittest.TestCase):
    def test_slugify_french(self) -> None:
        self.assertEqual(slugify("Altenberg de Bergheim"), "altenberg-de-bergheim")
        self.assertEqual(slugify("Épernay"), "epernay")

    def test_stable_parcel_id_deterministic(self) -> None:
        wkt = "POLYGON((0 0,1 0,1 1,0 1,0 0))"
        a = stable_parcel_id("inao-parcellaire", wkt, "A1", "D1", "68004", "X1")
        b = stable_parcel_id("inao-parcellaire", wkt, "A1", "D1", "68004", "X1")
        self.assertEqual(a, b)
        self.assertTrue(a.startswith("parcel-"))


class TestColumnMapping(unittest.TestCase):
    def test_maps_inao_aliases(self) -> None:
        cols = ["ID_APP", "denom", "INSEE", "nomcom", "id_aire"]
        mapped = build_column_map(cols)
        self.assertEqual(mapped["id_app"], "ID_APP")
        self.assertEqual(mapped["denom"], "denom")
        self.assertEqual(mapped["insee"], "INSEE")
        self.assertEqual(mapped["nomcom"], "nomcom")
        self.assertEqual(mapped["id_aire"], "id_aire")


class TestGeometry(unittest.TestCase):
    def test_fixture_loads_and_validates(self) -> None:
        path = FIXTURE_DIR / "alsace-parcellaire-sample.geojson"
        gdf = load_geodata(path)
        self.assertEqual(len(gdf), 2)
        ewkt = geometry_to_ewkt(gdf.geometry.iloc[0])
        self.assertIsNotNone(ewkt)
        assert ewkt is not None
        self.assertTrue(ewkt.startswith("SRID=4326;"))
        center = centroid_lon_lat(gdf.geometry.iloc[0])
        self.assertIsNotNone(center)
        mp = to_multipolygon(gdf.geometry.iloc[0])
        self.assertIsNotNone(mp)


class TestDryRunFixtures(unittest.TestCase):
    def test_all_initial_offline(self) -> None:
        bundle, stats = run_scope(
            "all-initial",
            Path("data/raw/wine-geodata"),
            skip_download=True,
            allow_download=False,
            fixture_dir=FIXTURE_DIR,
        )
        self.assertGreater(len(bundle.wine_areas), 0)
        self.assertGreater(len(bundle.wine_parcels), 0)
        self.assertGreater(len(bundle.wine_lieux_dits), 0)
        self.assertGreater(len(bundle.wine_area_parcels), 0)
        # Champagne GC/PC communes + Alsace areas
        self.assertGreaterEqual(len(bundle.wine_areas), 20)
        for area in bundle.wine_areas:
            self.assertEqual(area["source_type"], "real")
        for parcel in bundle.wine_parcels:
            self.assertEqual(parcel["source_type"], "real")
        self.assertTrue(stats)

    def test_source_dataset_rows(self) -> None:
        rows = build_source_dataset_rows()
        ids = {r["id"] for r in rows}
        self.assertIn("inao-parcellaire", ids)
        self.assertIn("etalab-cadastre", ids)
        self.assertIn("inao-aires-geo", ids)
        self.assertNotIn("inao-aires-produits", ids)


if __name__ == "__main__":
    unittest.main()
