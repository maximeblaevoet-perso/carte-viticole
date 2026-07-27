-- 0007_wine_mvt_tiles.sql
-- Serve hierarchical wine geodata as Mapbox Vector Tiles (MVT) via PostGIS.
-- Append-only. Read-only helper: builds one tile with several named layers so
-- MapLibre can style region / appellation / cru / parcel / lieu-dit separately.
--
-- Consumed by the Next.js route `/api/tiles/wine/{z}/{x}/{y}` (server-side proxy,
-- never exposes a Supabase key to the browser). Zoom gating + zoom-based
-- simplification keep payloads small (300+ parcels, 150k+ lieux-dits only ship
-- at high zoom, and always simplified to ~2px of the current tile).

-- ---------------------------------------------------------------------------
-- wine_mvt(z, x, y): concatenated MVT layers for one tile.
-- Layer names mirror the MapLibre source-layers:
--   wine-areas-region | wine-areas-appellation | wine-areas-cru
--   wine-parcels | wine-lieux-dits
-- Every feature keeps its provenance (source_dataset_id / source_type /
-- official / informative / license / attribution) so the UI can always show
-- where a shape comes from (INAO, Cadastre, RPG…).
-- ---------------------------------------------------------------------------
create or replace function public.wine_mvt(z integer, x integer, y integer)
returns bytea
language plpgsql
stable
parallel safe
as $$
declare
  env3857 geometry := ST_TileEnvelope(z, x, y);
  env4326 geometry := ST_Transform(ST_TileEnvelope(z, x, y), 4326);
  -- ~2 screen pixels expressed in Web-Mercator metres for this zoom. INAO cru
  -- contours are extremely dense; ~2px simplification roughly halves vertices
  -- with no visible change and keeps tiles light.
  tol double precision := 40075016.6855785 / power(2, z) / 2048;
  tile bytea := ''::bytea;
  part bytea;
begin
  -- Grandes régions (level 1) — low/mid zoom only.
  if z <= 8 then
    select ST_AsMVT(q, 'wine-areas-region', 4096, 'geom') into part
    from (
      select ST_AsMVTGeom(
               ST_SimplifyPreserveTopology(ST_Transform(a.geom, 3857), tol),
               env3857, 4096, 64, true) as geom,
             a.id, a.name, a.level, a.region_type, a.root_region_id, a.parent_id,
             a.source_dataset_id, a.source_type::text as source_type,
             a.is_official, a.is_informative, a.license, a.attribution
      from wine_areas a
      where a.level = 1 and a.geom is not null and a.geom && env4326
    ) q
    where q.geom is not null;
    if part is not null then tile := tile || part; end if;
  end if;

  -- Appellations / communes (levels 2-3) — mid zoom and up.
  if z >= 7 then
    select ST_AsMVT(q, 'wine-areas-appellation', 4096, 'geom') into part
    from (
      select ST_AsMVTGeom(
               ST_SimplifyPreserveTopology(ST_Transform(a.geom, 3857), tol),
               env3857, 4096, 64, true) as geom,
             a.id, a.name, a.level, a.region_type, a.root_region_id, a.parent_id,
             a.source_dataset_id, a.source_type::text as source_type,
             a.is_official, a.is_informative, a.license, a.attribution
      from wine_areas a
      where a.level in (2, 3) and a.geom is not null and a.geom && env4326
    ) q
    where q.geom is not null;
    if part is not null then tile := tile || part; end if;
  end if;

  -- Crus / climats (levels 4-5) — strong zoom.
  if z >= 10 then
    select ST_AsMVT(q, 'wine-areas-cru', 4096, 'geom') into part
    from (
      select ST_AsMVTGeom(
               ST_SimplifyPreserveTopology(ST_Transform(a.geom, 3857), tol),
               env3857, 4096, 64, true) as geom,
             a.id, a.name, a.level, a.region_type, a.root_region_id, a.parent_id,
             a.source_dataset_id, a.source_type::text as source_type,
             a.is_official, a.is_informative, a.license, a.attribution
      from wine_areas a
      where a.level in (4, 5) and a.geom is not null and a.geom && env4326
    ) q
    where q.geom is not null;
    if part is not null then tile := tile || part; end if;
  end if;

  -- Fine parcels (INAO parcellaire) — very strong zoom only.
  if z >= 13 then
    select ST_AsMVT(q, 'wine-parcels', 4096, 'geom') into part
    from (
      select ST_AsMVTGeom(
               ST_SimplifyPreserveTopology(ST_Transform(p.geom, 3857), tol),
               env3857, 4096, 64, true) as geom,
             p.id, p.name, p.parcel_ref, p.commune_insee, p.area_ha,
             p.cadastre_section, p.cadastre_numero, p.inao_id_aire,
             p.source_dataset_id, p.source_type::text as source_type,
             p.is_official, p.is_informative, p.license, p.attribution
      from wine_parcels p
      where p.geom is not null and p.geom && env4326
    ) q
    where q.geom is not null;
    if part is not null then tile := tile || part; end if;
  end if;

  -- Cadastral lieux-dits (Champagne labelling) — very strong zoom only.
  -- Joined to their wine_area so Champagne GC/PC is surfaced at commune level
  -- (parcels themselves are never classified individually).
  if z >= 13 then
    select ST_AsMVT(q, 'wine-lieux-dits', 4096, 'geom') into part
    from (
      select ST_AsMVTGeom(
               ST_SimplifyPreserveTopology(ST_Transform(l.geom, 3857), tol),
               env3857, 4096, 64, true) as geom,
             l.id, l.name, l.commune_insee, l.wine_area_id,
             wa.name as area_name, wa.region_type as area_region_type,
             l.cadastre_source_ref,
             l.source_dataset_id, l.source_type::text as source_type,
             l.is_official, l.is_informative, l.license, l.attribution
      from wine_lieux_dits l
      left join wine_areas wa on wa.id = l.wine_area_id
      where l.geom is not null and l.geom && env4326
    ) q
    where q.geom is not null;
    if part is not null then tile := tile || part; end if;
  end if;

  return tile;
end;
$$;

comment on function public.wine_mvt(integer, integer, integer) is
  'Returns concatenated MVT layers (region/appellation/cru/parcels/lieux-dits) for tile z/x/y. Read-only, zoom-gated, zoom-simplified. Consumed by /api/tiles/wine.';

grant execute on function public.wine_mvt(integer, integer, integer)
  to anon, authenticated, service_role;
