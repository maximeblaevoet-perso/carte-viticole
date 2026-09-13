-- 0010_alsace_layer_refinement.sql
-- Readability pass on the Alsace layers (ADR 0012).
--
-- 1. wine_parcels gains map_visible: the INAO "parcellaire" is an aire
--    délimitée per commune x denomination, so the two regional product AOCs
--    (Alsace, Crémant d'Alsace) repeat the whole vineyard footprint 117 times
--    each and drown every useful shape at high zoom.
-- 2. The level-2 "Alsace Grand Cru" node carried the INAO parent envelope,
--    which covers the entire region. Replace it by the dissolved union of the
--    named grands crus, i.e. what the label actually means.
-- 3. wine_mvt honours wine_parcels.map_visible.
-- 4. wine_real_coverage tells the client which regions have real contours, so
--    the rough synthetic footprints stop being drawn underneath them.

-- ---------------------------------------------------------------------------
-- Editorial map visibility on fine parcels (mirrors wine_areas.map_visible)
-- ---------------------------------------------------------------------------
alter table public.wine_parcels
  add column if not exists map_visible boolean not null default true;

comment on column public.wine_parcels.map_visible is
  'When false, the parcel stays queryable but is omitted from MVT map tiles.';

create index if not exists wine_parcels_map_visible_idx
  on public.wine_parcels (map_visible)
  where map_visible = false;

-- Regional / product AOC aires: same footprint as the whole vineyard, no
-- information beyond what the level-1 region already shows.
update public.wine_parcels
set map_visible = false, updated_at = now()
where source_dataset_id = 'inao-parcellaire'
  and name in ('Alsace', 'Crémant d''Alsace', 'Crémant d’Alsace');

-- Grand-cru aires: the level-4 cru contours were dissolved FROM these very
-- parcels (migration 0009) and stay on screen up to z22, so the parcel layer
-- would just repeat them. The sub-appellation aires (Alsace Bergheim, Alsace
-- Ottrott…) are kept: their level-3 areas fade at z11, so above that zoom the
-- parcel is the only place their delimitation is still visible.
update public.wine_parcels p
set map_visible = false, updated_at = now()
where p.source_dataset_id = 'inao-parcellaire'
  and p.map_visible
  and exists (
    select 1
    from public.wine_areas a
    where a.name = p.name
      and a.level = 4
      and a.map_visible
      and a.geom is not null
  );

-- ---------------------------------------------------------------------------
-- "Alsace Grand Cru" (level 2) = dissolved union of the named grands crus
-- ---------------------------------------------------------------------------
with gc_union as (
  select ST_Multi(ST_UnaryUnion(ST_Collect(a.geom))) as geom
  from public.wine_areas a
  where a.root_region_id = 'alsace'
    and a.level = 4
    and a.region_type = 'grand-cru'
    and a.map_visible
    and a.id <> 'alsace-alsace-grand-cru'
    and a.geom is not null
)
update public.wine_areas dest
set geom = u.geom,
    center = ST_PointOnSurface(u.geom),
    updated_at = now()
from gc_union u
where dest.id = 'alsace-grand-cru'
  and u.geom is not null
  and not ST_IsEmpty(u.geom);

-- The node is a quality tier, not a place: region_type drives the cru colour
-- in the map (RegionType is deliberately decoupled from AreaLevel — an Alsace
-- grand cru sits at level 2, a Burgundy one at level 4).
update public.wine_areas
set region_type = 'grand-cru', updated_at = now()
where id = 'alsace-grand-cru'
  and region_type <> 'grand-cru';

-- ---------------------------------------------------------------------------
-- wine_mvt: parcel visibility
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

  -- Fine parcels (INAO parcellaire) — very strong zoom, editorial filter.
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
        and p.map_visible
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
             wa.root_region_id as area_root_region_id,
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
  'MVT layers for tile z/x/y. Filters wine_areas.map_visible and wine_parcels.map_visible, respects zoom_min/zoom_max, fades appellations before crus. Consumed by /api/tiles/wine.';

-- ---------------------------------------------------------------------------
-- Real-geometry coverage (drives synthetic-layer suppression in the client)
-- ---------------------------------------------------------------------------
create or replace view public.wine_real_coverage as
select a.root_region_id,
       count(*)::bigint as areas_with_geom
from public.wine_areas a
where a.geom is not null
group by a.root_region_id;

comment on view public.wine_real_coverage is
  'Root regions that have at least one real PostGIS contour. The map hides its rough synthetic footprints for these regions (ADR 0012).';

grant select on public.wine_real_coverage to anon, authenticated;
