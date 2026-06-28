# Data model

SQL lives in `supabase/migrations/`. TypeScript mirrors live in
`src/lib/types.ts`. Keep them in sync.

## Tables

### `wine_regions`
Wine regions shown on the map. `id` is a slug. PostGIS `center` (Point) and
`geom` (MultiPolygon, editorial footprint — not official AOC limits).

### `weather_stations`
Physical/virtual stations. PostGIS `location` (Point). `source_type`.

### `region_weather_stations`
Many-to-many `region ↔ station` with a `weight` used when aggregating station
data to a region.

### `daily_weather`
**The source granularity.** One row per `(station_id, obs_date)`.
Priority columns: `t_min_c`, `t_max_c`, `t_mean_c`, `precip_mm`.
Secondary (optional): `humidity_pct`, `wind_ms`, `sunshine_h`, `radiation_mj`.
`source_type` per row.

### `region_vintage_climate`
Computed indicators per `(region_id, vintage_year)`:
`growing_season_temp_c`, `gdd`, `days_above_30`, `days_above_35`,
`spring_frost_days`, `rain_apr_sep_mm`, `rain_jul_aug_mm`, `rain_sep_mm`,
`longest_dry_spell_days`, `water_stress_index`, `harvest_rain_risk_index`.
Plus `flags` (jsonb), `summary` (text), `monthly` (jsonb rollup),
`source_type`, `confidence`.

### `region_soils`
Soil descriptions per region: `soil_type`, `description`, `share_percent`,
`source_type`.

### `vintage_scores`
Generic external-scores container: `source_name`, `score_value`, `score_scale`,
`note`, `source_type`. No proprietary critic hardcoded in V1.

## Relationships

```
wine_regions 1───* region_weather_stations *───1 weather_stations
weather_stations 1───* daily_weather
wine_regions 1───* region_vintage_climate   (computed from daily_weather)
wine_regions 1───* region_soils
wine_regions 1───* vintage_scores
```

## Hierarchical wine areas (map navigation)

The map navigates a NON-uniform hierarchy (région → sous-région → village → cru
→ parcelle). It is an additive layer on top of `wine_regions`: level-1 areas
reuse the existing region ids, so climate/soils/scores keep working.

- TS type: `WineArea` (`src/lib/types.ts`); seed tree + helpers in
  `src/data/areas.ts`; contours kept SEPARATE in `src/data/geo.ts` (keyed by
  `geoJsonId`).
- Climate stays macro: sub-areas inherit it via `rootRegionId`. Soils can be
  finer (`AREA_SOILS` + `getSoilsForArea` fallback). Missing data → "donnée
  indisponible" (never invented).
- Future SQL: a self-referencing `wine_areas` table (`id`, `name`, `level`,
  `parent_id`, `root_region_id`, `region_type`, `geom`/`center`, `zoom_min`,
  `zoom_max`, `available_data_scopes`) would mirror `WineArea`. Not yet migrated
  (V1 is frontend-only). See `docs/wine-hierarchy.md` and ADR 0004.

## TypeScript ↔ SQL mapping

| SQL table                 | TS type                |
| ------------------------- | ---------------------- |
| `wine_regions`            | `WineRegion`           |
| (planned) `wine_areas`    | `WineArea`             |
| `daily_weather`           | (ingestion only)       |
| `region_vintage_climate`  | `RegionVintageClimate` |
| (monthly jsonb)           | `MonthlyClimate[]`     |
| (indicator columns)       | `ClimateIndicators`    |
| (flags jsonb)             | `VintageProfileFlags`  |
| `region_soils`            | `RegionSoil`           |
| `vintage_scores`          | `VintageScore`         |

`source_type` ⇄ `SourceType` (`'synthetic' | 'real' | 'manual'`).
