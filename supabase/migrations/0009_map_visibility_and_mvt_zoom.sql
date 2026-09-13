-- 0009_map_visibility_and_mvt_zoom.sql
-- Progressive map readability for hierarchical wine areas.
--
-- 1. Add map_visible so product AOCs / regional footprint duplicates can stay
--    in the hierarchy (panel, climate) without cluttering the map.
-- 2. Rewrite wine_mvt to honour map_visible + per-row zoom_min/zoom_max, and
--    to fade appellations when cru layers take over (aligned with LEVEL_ZOOM).
-- 3. One-shot Alsace cleanup: promote useful footprints to L1/L2, hide
--    Crémant / AOC "Alsace" / generic GC envelope / identical GC clones.

-- ---------------------------------------------------------------------------
-- Schema: editorial map visibility (default visible)
-- ---------------------------------------------------------------------------
alter table public.wine_areas
  add column if not exists map_visible boolean not null default true;

comment on column public.wine_areas.map_visible is
  'When false, the area stays in the hierarchy but is omitted from MVT map tiles.';

create index if not exists wine_areas_map_visible_idx
  on public.wine_areas (map_visible)
  where map_visible = false;

-- ---------------------------------------------------------------------------
-- wine_mvt: visibility + zoom bands
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
  tol double precision := 40075016.6855785 / power(2, z) / 2048;
  tile bytea := ''::bytea;
  part bytea;
begin
  -- Grandes régions (level 1) — low/mid zoom only (LEVEL_ZOOM L1 max ≈ 8).
  if z <= 8 then
    select ST_AsMVT(q, 'wine-areas-region', 4096, 'geom') into part
    from (
      select ST_AsMVTGeom(
               ST_SimplifyPreserveTopology(ST_Transform(a.geom, 3857), tol),
               env3857, 4096, 64, true) as geom,
             a.id, a.name, a.level, a.region_type, a.root_region_id, a.parent_id,
             a.zoom_min, a.zoom_max, a.map_visible,
             a.source_dataset_id, a.source_type::text as source_type,
             a.is_official, a.is_informative, a.license, a.attribution
      from wine_areas a
      where a.level = 1
        and a.map_visible
        and a.geom is not null
        and a.geom && env4326
        and z >= floor(a.zoom_min)
        and (a.zoom_max <= 0 or z < a.zoom_max)
    ) q
    where q.geom is not null;
    if part is not null then tile := tile || part; end if;
  end if;

  -- Appellations / sous-régions (levels 2-3) — mid zoom, hide when crus appear.
  -- Hard upper gate z < 11 matches LEVEL_ZOOM L2 max 10.5 (integer tiles).
  if z >= 7 and z < 11 then
    select ST_AsMVT(q, 'wine-areas-appellation', 4096, 'geom') into part
    from (
      select ST_AsMVTGeom(
               ST_SimplifyPreserveTopology(ST_Transform(a.geom, 3857), tol),
               env3857, 4096, 64, true) as geom,
             a.id, a.name, a.level, a.region_type, a.root_region_id, a.parent_id,
             a.zoom_min, a.zoom_max, a.map_visible,
             a.source_dataset_id, a.source_type::text as source_type,
             a.is_official, a.is_informative, a.license, a.attribution
      from wine_areas a
      where a.level in (2, 3)
        and a.map_visible
        and a.geom is not null
        and a.geom && env4326
        and z >= floor(a.zoom_min)
        and (a.zoom_max <= 0 or z < a.zoom_max)
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
             a.zoom_min, a.zoom_max, a.map_visible,
             a.source_dataset_id, a.source_type::text as source_type,
             a.is_official, a.is_informative, a.license, a.attribution
      from wine_areas a
      where a.level in (4, 5)
        and a.map_visible
        and a.geom is not null
        and a.geom && env4326
        and z >= floor(a.zoom_min)
        and (a.zoom_max <= 0 or z < a.zoom_max)
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
        and z >= floor(p.zoom_min)
    ) q
    where q.geom is not null;
    if part is not null then tile := tile || part; end if;
  end if;

  -- Cadastral lieux-dits — very strong zoom only.
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
  'MVT layers for tile z/x/y. Filters map_visible, respects zoom_min/zoom_max, fades appellations before crus. Consumed by /api/tiles/wine.';

-- ---------------------------------------------------------------------------
-- Alsace one-shot cleanup (idempotent where possible)
-- ---------------------------------------------------------------------------

-- Promote AOC Alsace footprint onto the L1 region (seed had no PostGIS geom).
update public.wine_areas dest
set
  geom = src.geom,
  center = coalesce(dest.center, src.center),
  source_dataset_id = coalesce(dest.source_dataset_id, src.source_dataset_id),
  source_type = case when dest.geom is null then src.source_type else dest.source_type end,
  is_official = case when dest.geom is null then src.is_official else dest.is_official end,
  is_informative = case when dest.geom is null then src.is_informative else dest.is_informative end,
  license = coalesce(dest.license, src.license),
  attribution = coalesce(dest.attribution, src.attribution),
  updated_at = now()
from public.wine_areas src
where dest.id = 'alsace'
  and src.id = 'alsace-alsace'
  and src.geom is not null
  and dest.geom is null;

-- Promote generic "Alsace grand cru" envelope onto the L2 node.
update public.wine_areas dest
set
  geom = src.geom,
  center = coalesce(dest.center, src.center),
  source_dataset_id = coalesce(dest.source_dataset_id, src.source_dataset_id),
  source_type = case when dest.geom is null then src.source_type else dest.source_type end,
  is_official = case when dest.geom is null then src.is_official else dest.is_official end,
  is_informative = case when dest.geom is null then src.is_informative else dest.is_informative end,
  license = coalesce(dest.license, src.license),
  attribution = coalesce(dest.attribution, src.attribution),
  updated_at = now()
from public.wine_areas src
where dest.id = 'alsace-grand-cru'
  and src.id = 'alsace-alsace-grand-cru'
  and src.geom is not null
  and dest.geom is null;

-- Hide product AOC / regional footprint duplicates / generic parent denom.
update public.wine_areas
set map_visible = false, updated_at = now()
where id in (
  'alsace-alsace',
  'alsace-cremant-d-alsace',
  'alsace-alsace-grand-cru'
);

-- Hide named GC rows whose geom is an exact clone of the generic envelope
-- (INAO aires-geo ships the parent AOC polygon under each cru name).
update public.wine_areas a
set map_visible = false, updated_at = now()
where a.root_region_id = 'alsace'
  and a.level = 4
  and a.map_visible
  and a.geom is not null
  and exists (
    select 1
    from public.wine_areas g
    where g.id = 'alsace-alsace-grand-cru'
      and g.geom is not null
      and ST_Equals(ST_Normalize(a.geom), ST_Normalize(g.geom))
  );

-- Align zoom bands with LEVEL_ZOOM (src/data/areas.ts).
update public.wine_areas
set zoom_min = 0, zoom_max = 8, updated_at = now()
where level = 1;

update public.wine_areas
set zoom_min = 7, zoom_max = 10.5, updated_at = now()
where level = 2;

update public.wine_areas
set zoom_min = 7, zoom_max = 10.5, updated_at = now()
where level = 3;

update public.wine_areas
set zoom_min = 10, zoom_max = 22, updated_at = now()
where level in (4, 5);

-- Replace cloned INAO GC envelopes with dissolved parcellaire contours when
-- parcels are linked (distinct per-cru shapes; aires-geo alone is insufficient).
with dissolved as (
  select wap.wine_area_id as id,
         ST_Multi(ST_UnaryUnion(ST_Collect(p.geom))) as geom,
         count(*) as n_parcels
  from wine_area_parcels wap
  join wine_parcels p on p.id = wap.wine_parcel_id
  join wine_areas a on a.id = wap.wine_area_id
  where a.root_region_id = 'alsace'
    and a.level = 4
    and a.id <> 'alsace-alsace-grand-cru'
    and p.geom is not null
  group by wap.wine_area_id
)
update wine_areas a
set
  geom = d.geom,
  center = ST_PointOnSurface(d.geom),
  map_visible = true,
  zoom_min = 10,
  zoom_max = 22,
  updated_at = now()
from dissolved d
where a.id = d.id
  and d.n_parcels > 0;
