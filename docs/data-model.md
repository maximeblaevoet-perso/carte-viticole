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
`source_type` per row. **Not pushed to Supabase by default** (huge, UI never
reads it): kept as a LOCAL computation source feeding `region_vintage_climate`.
See ADR 0005.

### `region_vintage_climate`
**The only climate table the frontend reads** (via `src/data/climate.ts`; daily
stays ingestion-only — see ADR 0005). Computed indicators per
`(region_id, vintage_year)`:
`growing_season_temp_c`, `gdd`, `days_above_30`, `days_above_35`,
`spring_frost_days`, `rain_apr_sep_mm`, `rain_jul_aug_mm`, `rain_sep_mm`,
`longest_dry_spell_days`, `water_stress_index`, `harvest_rain_risk_index`.
Plus `flags` (jsonb), `summary` (text), `source_type`, `confidence`, and two
rollups of the same daily source:

- `monthly` (jsonb) — 12 bins, the **default** chart granularity:
  `{ month, t_mean_c, t_max_c, t_min_c, precip_mm }`.
  `t_mean_c` is the mean of daily means; `t_max_c` / `t_min_c` are the true
  extremes of daily TX / TN over the month (ADR 0009).
- `weekly` (jsonb, migration 0008) — 53 bins for the optional weekly mode:
  `{ week, start_date, end_date, days, t_mean_c, t_max_c, t_min_c, precip_mm }`.
  Same aggregation rules as monthly. Weeks are **fixed 7-day bins anchored on
  1 January** (week 53 keeps the remaining 1–2 days), **not ISO 8601 weeks**,
  so bins align across vintages. Values are `null` when a bin has no
  observation; `days` gives its coverage. An empty array means weekly was not
  computed for that row. See ADR 0008.

### `region_soils`
Soil descriptions per region: `soil_type`, `description`, `share_percent`,
`source_type`.

### `vintage_scores`
Generic external-scores container: `source_name`, `score_value`, `score_scale`,
`note`, `source_type`. No proprietary critic hardcoded in V1.

### `source_datasets`
Catalog of public geodata providers (INAO, Etalab, IGN…). Stores URL, licence,
attribution, disclaimer and `source_updated_at`. Seeded in migration 0005 with
planned sources — no geometry.

### `wine_areas`
Hierarchical navigation layer (NOT every cadastral parcel). Self-referencing
`parent_id`, links to `wine_regions` via `root_region_id`. PostGIS `center`
(Point) and `geom` (MultiPolygon). Mirrors the TS `WineArea` type plus INAO/INSEE
ingest keys (`inao_id_app`, `inao_id_denom`, `insee_commune`). Provenance:
`source_dataset_id`, `source_type`, `is_official`, `is_informative`,
`source_updated_at`, `license`, `attribution`. GIST indexes on `geom` and
`center`.

Stores: régions fines, appellations AOC/AOP/IGP, communes Grand/Premier Cru
(Champagne), 51 Alsace Grands Crus, climats/1ers crus (Bourgogne, structure
ready). Levels 1–5; zoom bands `zoom_min` / `zoom_max`.

### `wine_parcels`
Fine parcel polygons shown only at high zoom (`zoom_min` default 14). Separate
table to avoid hierarchy volume explosion. Cadastral refs, INAO `id_aire`, optional
RPG plot id. Same provenance columns as `wine_areas`. GIST on `geom` and `center`.

### `wine_area_parcels`
Many-to-many link `wine_area_id` ↔ `wine_parcel_id` with `relationship`
(e.g. `contains`). Lets a cru/climat reference many parcels without nesting them
in `wine_areas`.

### `wine_lieux_dits`
Cadastral lieux-dits (especially Champagne: parcel label at high zoom). Optional
`wine_area_id` parent. PostGIS `center` + `geom`. Provenance columns as above.

## Relationships

```
wine_regions 1───* region_weather_stations *───1 weather_stations
weather_stations 1───* daily_weather
wine_regions 1───* region_vintage_climate   (computed from daily_weather)
wine_regions 1───* region_soils
wine_regions 1───* vintage_scores
wine_regions 1───* wine_areas               (via root_region_id)
wine_areas   1───* wine_areas               (parent_id, self-ref)
source_datasets 1───* wine_areas | wine_parcels | wine_lieux_dits
wine_areas   *───* wine_parcels             (via wine_area_parcels)
wine_areas   1───* wine_lieux_dits          (optional wine_area_id)
```

## Hierarchical wine areas (map navigation)

The map navigates a NON-uniform hierarchy (région → sous-région → village → cru
→ parcelle). It is an additive layer on top of `wine_regions`: level-1 areas
reuse the existing region ids, so climate/soils/scores keep working.

- TS type: `WineArea` (`src/lib/types.ts`); seed tree + helpers in
  `src/data/areas.ts`; Supabase seam in `src/data/wine-geodata.ts`; contours
  kept SEPARATE in `src/data/geo.ts` (keyed by `geoJsonId`) until PostGIS geom
  is wired to the map.
- **Hybrid storage (ADR 0006):** `wine_areas` = hierarchy; `wine_parcels` =
  fine polygons at high zoom; `wine_area_parcels` = links; `wine_lieux_dits` =
  cadastral names (Champagne). `source_datasets` = provenance catalog.
- Climate stays macro: sub-areas inherit it via `rootRegionId`. Soils can be
  finer (`AREA_SOILS` + `getSoilsForArea` fallback). Missing data → "donnée
  indisponible" (never invented).
- Initial import scope: **Alsace** (51 Grands Crus), **Champagne** (GC/PC
  communes + lieux-dits), structure extensible **Bourgogne**. No geometry in
  migration 0005 — schema + source catalog only.

## TypeScript ↔ SQL mapping

| SQL table                 | TS type                |
| ------------------------- | ---------------------- |
| `wine_regions`            | `WineRegion`           |
| `source_datasets`         | `SourceDataset`        |
| `wine_areas`              | `WineArea`             |
| `wine_parcels`            | `WineParcel`           |
| `wine_area_parcels`       | `WineAreaParcel`       |
| `wine_lieux_dits`         | `WineLieuDit`          |
| `daily_weather`           | (ingestion only)       |
| `region_vintage_climate`  | `RegionVintageClimate` |
| (monthly jsonb)           | `MonthlyClimate[]`     |
| (weekly jsonb)            | `WeeklyClimate[]`      |
| (indicator columns)       | `ClimateIndicators`    |
| (flags jsonb)             | `VintageProfileFlags`  |
| `region_soils`            | `RegionSoil`           |
| `vintage_scores`          | `VintageScore`         |

`source_type` ⇄ `SourceType` (`'synthetic' | 'real' | 'manual'`). Geographic
entities also carry `GeoDataProvenance` (`isOfficial`, `isInformative`, dataset
id, licence, attribution).

## Frontend data access

The UI does not import the synthetic engine directly anymore. It goes through
`src/data/climate.ts` (`getVintageClimate`, `getRegionVintageClimates`), which
reads `region_vintage_climate` from Supabase when configured and otherwise falls
back to synthetic. The frontend **never** queries `daily_weather`; charts come
from `region_vintage_climate.monthly` (default) and `.weekly` (user toggle), both
fetched on the same row. See ADR 0005 and ADR 0008.
