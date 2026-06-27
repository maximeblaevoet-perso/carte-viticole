-- 0002_core_tables.sql
-- Core domain tables for the wine-vintage climate explorer.
-- Granularity for V1 weather is DAILY (see docs/decisions/0002-use-daily-weather-first.md).

-- ---------------------------------------------------------------------------
-- wine_regions: the wine regions explored on the map.
-- ---------------------------------------------------------------------------
create table if not exists wine_regions (
  id          text primary key,                 -- slug, e.g. 'bordeaux'
  name        text not null,
  macro_area  text,
  blurb       text,
  -- Representative point for labels / map centering.
  center      geometry(Point, 4326),
  -- Editorial footprint (NOT official AOC boundary).
  geom        geometry(MultiPolygon, 4326),
  created_at  timestamptz not null default now()
);
create index if not exists wine_regions_geom_gix on wine_regions using gist (geom);

-- ---------------------------------------------------------------------------
-- weather_stations: physical/virtual weather stations (Météo-France etc.).
-- ---------------------------------------------------------------------------
create table if not exists weather_stations (
  id            text primary key,               -- external station id
  name          text not null,
  elevation_m   numeric,
  location      geometry(Point, 4326) not null,
  source_type   source_type not null default 'synthetic',
  created_at    timestamptz not null default now()
);
create index if not exists weather_stations_loc_gix on weather_stations using gist (location);

-- ---------------------------------------------------------------------------
-- region_weather_stations: many-to-many mapping with a weight used when
-- aggregating station data up to a region.
-- ---------------------------------------------------------------------------
create table if not exists region_weather_stations (
  region_id   text not null references wine_regions (id) on delete cascade,
  station_id  text not null references weather_stations (id) on delete cascade,
  weight      numeric not null default 1.0,
  primary key (region_id, station_id)
);

-- ---------------------------------------------------------------------------
-- daily_weather: THE source granularity. One row per station per day.
-- Priority V1 variables are NOT NULL-friendly; secondary ones are optional.
-- ---------------------------------------------------------------------------
create table if not exists daily_weather (
  station_id    text not null references weather_stations (id) on delete cascade,
  obs_date      date not null,
  t_min_c       numeric,    -- daily minimum temperature
  t_max_c       numeric,    -- daily maximum temperature
  t_mean_c      numeric,    -- daily mean temperature
  precip_mm     numeric,    -- daily precipitation
  -- Secondary (modelled but not prioritised in the V1 UI):
  humidity_pct  numeric,
  wind_ms       numeric,
  sunshine_h    numeric,
  radiation_mj  numeric,
  source_type   source_type not null default 'synthetic',
  primary key (station_id, obs_date)
);
create index if not exists daily_weather_date_idx on daily_weather (obs_date);

-- ---------------------------------------------------------------------------
-- region_vintage_climate: computed region x vintage indicators.
-- Every row carries source_type + confidence. monthly is a JSONB rollup used
-- by the default (monthly) charts; daily stays the computation source.
-- ---------------------------------------------------------------------------
create table if not exists region_vintage_climate (
  region_id                text not null references wine_regions (id) on delete cascade,
  vintage_year             int not null,
  -- headline indicators
  growing_season_temp_c    numeric,
  gdd                      numeric,
  days_above_30            int,
  days_above_35            int,
  spring_frost_days        int,
  rain_apr_sep_mm          numeric,
  rain_jul_aug_mm          numeric,
  rain_sep_mm              numeric,
  longest_dry_spell_days   int,
  water_stress_index       numeric,
  harvest_rain_risk_index  numeric,
  -- profile flags + narrative
  flags                    jsonb not null default '{}'::jsonb,
  summary                  text,
  -- monthly rollup: [{ "month":1, "t_mean_c":.., "t_max_c":.., "t_min_c":.., "precip_mm":.. }, ...]
  monthly                  jsonb not null default '[]'::jsonb,
  source_type              source_type not null default 'synthetic',
  confidence               numeric not null default 0.4,
  computed_at              timestamptz not null default now(),
  primary key (region_id, vintage_year)
);

-- ---------------------------------------------------------------------------
-- region_soils: soil descriptions per region.
-- ---------------------------------------------------------------------------
create table if not exists region_soils (
  id            bigint generated always as identity primary key,
  region_id     text not null references wine_regions (id) on delete cascade,
  soil_type     text not null,
  description   text,
  share_percent numeric,
  source_type   source_type not null default 'synthetic'
);
create index if not exists region_soils_region_idx on region_soils (region_id);

-- ---------------------------------------------------------------------------
-- vintage_scores: GENERIC external scores container. V1 does NOT hardcode any
-- protected/proprietary critic (e.g. Parker). Do not scrape protected content.
-- ---------------------------------------------------------------------------
create table if not exists vintage_scores (
  id            bigint generated always as identity primary key,
  region_id     text not null references wine_regions (id) on delete cascade,
  vintage_year  int not null,
  source_name   text not null,        -- generic label
  score_value   numeric,
  score_scale   text,                 -- e.g. '0-100', '0-20'
  note          text,
  source_type   source_type not null default 'manual',
  created_at    timestamptz not null default now()
);
create index if not exists vintage_scores_region_year_idx
  on vintage_scores (region_id, vintage_year);
