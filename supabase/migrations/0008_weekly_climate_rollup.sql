-- 0008_weekly_climate_rollup.sql
-- Add a WEEKLY rollup next to the existing monthly one on region_vintage_climate,
-- so the temperature / rainfall charts can switch between monthly (default) and
-- weekly. Append-only; daily stays the source granularity (ADR 0002) and the
-- frontend still reads aggregates only (ADR 0005). See ADR 0008.
--
-- Weeks are FIXED 7-day bins anchored on 1 January: week w covers days-of-year
-- 7(w-1)+1 .. 7w, and week 53 holds the remaining 1-2 days. They are NOT ISO
-- 8601 weeks: aligned bins let two vintages be compared week by week without
-- year-boundary drift. See docs/climate-methodology.md.

alter table region_vintage_climate
  add column if not exists weekly jsonb not null default '[]'::jsonb;

comment on column region_vintage_climate.weekly is
  'Weekly rollup of daily data, fixed 7-day bins anchored on 1 January (NOT ISO weeks): [{"week":1,"start_date":"2018-01-01","end_date":"2018-01-07","days":7,"t_mean_c":..,"t_max_c":..,"t_min_c":..,"precip_mm":..}, ...]. Temperatures/precip are null when the bin has no observation. Empty array = weekly not computed for this row.';

comment on column region_vintage_climate.monthly is
  'Monthly rollup of daily data (default chart granularity): [{"month":1,"t_mean_c":..,"t_max_c":..,"t_min_c":..,"precip_mm":..}, ...].';
