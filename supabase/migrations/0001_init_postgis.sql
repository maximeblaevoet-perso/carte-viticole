-- 0001_init_postgis.sql
-- Enable PostGIS for geometry support. Run first.

create extension if not exists postgis;

-- Shared enum for data provenance. Used across every table that stores values
-- which might be synthetic, real, or manually entered. NEVER mix silently.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'source_type') then
    create type source_type as enum ('synthetic', 'real', 'manual');
  end if;
end$$;
