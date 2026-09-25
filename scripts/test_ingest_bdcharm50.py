#!/usr/bin/env python3
"""Tests for the BD Charm-50 ingestion (no downloads, no database)."""

from __future__ import annotations

import unittest

from shapely.geometry import GeometryCollection, LineString, Point, Polygon

from ingest_bdcharm50 import _as_polygonal, archive_url, unit_id


class TestArchiveUrl(unittest.TestCase):
    def test_pads_department_to_three_digits(self) -> None:
        self.assertTrue(archive_url("68").endswith("GEO050K_HARM_068.zip"))
        self.assertTrue(archive_url("08").endswith("GEO050K_HARM_008.zip"))


class TestUnitId(unittest.TestCase):
    def test_is_stable_and_namespaced(self) -> None:
        self.assertEqual(unit_id("68", 4211), "bdcharm50-68-4211")
        self.assertEqual(unit_id("68", 4211), unit_id("68", 4211))
        self.assertNotEqual(unit_id("68", 4211), unit_id("67", 4211))


class TestAsPolygonal(unittest.TestCase):
    """A clip along a shared boundary leaves lines and points behind."""

    square = Polygon([(0, 0), (0, 1), (1, 1), (1, 0)])

    def test_keeps_polygons(self) -> None:
        self.assertEqual(_as_polygonal(self.square), self.square)

    def test_drops_pure_line_debris(self) -> None:
        self.assertIsNone(_as_polygonal(LineString([(0, 0), (1, 1)])))

    def test_keeps_only_the_polygonal_part_of_a_collection(self) -> None:
        mixed = GeometryCollection(
            [self.square, LineString([(2, 2), (3, 3)]), Point(4, 4)]
        )
        kept = _as_polygonal(mixed)
        assert kept is not None
        self.assertAlmostEqual(kept.area, self.square.area)

    def test_drops_empty(self) -> None:
        self.assertIsNone(_as_polygonal(Polygon()))


if __name__ == "__main__":
    unittest.main()
