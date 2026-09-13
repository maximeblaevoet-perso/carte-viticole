/**
 * Cache-busting token for MapLibre wine MVT URLs.
 *
 * Hard refresh does not bypass a CDN / shared HTTP cache keyed only on
 * `/api/tiles/wine/{z}/{x}/{y}`. Changing this value (or
 * `NEXT_PUBLIC_WINE_TILES_VERSION`) forces fresh tile fetches after an ingest
 * or dissolve that rewrites `wine_areas` geometries.
 */
export const WINE_TILES_VERSION =
  process.env.NEXT_PUBLIC_WINE_TILES_VERSION ?? "2026-09-12b";
