-- 0017_progressive_map_reading.sql
-- Progressive, readable map (ADR 0022). Append-only.
--
-- wine_areas:   + map_color_idx (0..7): one pastel per area, two touching
--                 siblings of the same level never share it (greedy colouring);
--               + label_point: one point on the largest part of the area, so a
--                 fragmented appellation gets ONE label, not one per fragment
--                 and per tile ("Côte de Beaune" x 40);
--               + short_name: cru name without the "<village> premier cru"
--                 prefix, so the tier is told by the style, not repeated text.
-- wine_mvt:     area contours are no longer cut at their zoom_max — the client
--                 fades fills and keeps parent outlines (no blank band between
--                 appellations and vines, Mâconnais z11–13);
--               + wine-areas-labels (one point per area);
--               wine-lieux-dits-labels + area_name / area_region_type, so a
--                 lieu-dit label repeating its cru's name can be hidden.
--
-- Rerun `select wine_areas_refresh_map_style('<region>');` after re-ingesting
-- a region's areas (docs/mode-op-replication-region.md).

alter table wine_areas
  add column if not exists map_color_idx smallint,
  add column if not exists label_point geometry(Point, 4326),
  add column if not exists short_name text;

comment on column wine_areas.map_color_idx is
  'Display colour slot 0..7 (ADR 0022). Touching siblings of the same level differ. Cosmetic, never data.';
comment on column wine_areas.label_point is
  'Label anchor on the largest polygon part (ADR 0022). Cosmetic, never data.';
comment on column wine_areas.short_name is
  'Cru name without the "<appellation> premier/grand cru" prefix, for map labels (ADR 0022).';

create or replace function public.wine_areas_refresh_map_style(p_root text default null)
returns void
language plpgsql
as $$
declare
  r record;
  used smallint[];
  pick smallint;
begin
  -- Label anchor: point on the largest part; short name for crus.
  update wine_areas a
  set label_point = (
        select ST_PointOnSurface(d.geom)
        from ST_Dump(a.geom) d
        order by ST_Area(d.geom) desc
        limit 1),
      short_name = case
        when a.level >= 4 then
          nullif(btrim(regexp_replace(a.name, '^.*\m(premier|grand) cru\s+', '', 'i')), '')
        else null end
  where a.geom is not null
    and (p_root is null or a.root_region_id = p_root);

  -- Greedy colouring, level by level, biggest areas first (they have the
  -- most neighbours). Adjacency = closer than ~150 m.
  update wine_areas set map_color_idx = null
  where (p_root is null or root_region_id = p_root);

  for r in
    select a.id, a.level, a.root_region_id, a.geom
    from wine_areas a
    where a.geom is not null and a.map_visible
      and a.level between 1 and 5
      and (p_root is null or a.root_region_id = p_root)
    order by a.root_region_id, a.level, ST_Area(a.geom) desc
  loop
    select coalesce(array_agg(distinct n.map_color_idx), '{}') into used
    from wine_areas n
    where n.root_region_id = r.root_region_id
      and n.level = r.level
      and n.id <> r.id
      and n.map_color_idx is not null
      and n.geom && ST_Expand(r.geom, 0.002)
      and ST_DWithin(n.geom, r.geom, 0.002);

    pick := 0;
    while pick = any(used) and pick < 7 loop
      pick := pick + 1;
    end loop;

    update wine_areas set map_color_idx = pick where id = r.id;
  end loop;
end;
$$;

comment on function public.wine_areas_refresh_map_style(text) is
  'Recomputes map_color_idx, label_point and short_name (ADR 0022). Null = every region.';

select public.wine_areas_refresh_map_style(null);

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
  -- Large parent areas are now served at every zoom: clip to the tile (plus
  -- the MVT buffer) before simplifying, never the whole region per tile.
  clip3857 box2d := ST_Expand(ST_TileEnvelope(z, x, y), 40075016.6855785 / power(2, z) / 32)::box2d;
  tile bytea := ''::bytea;
  part bytea;
begin
  -- Region outline at every zoom: it frames the deeper levels (ADR 0022).
  select ST_AsMVT(q, 'wine-areas-region', 4096, 'geom') into part
  from (
    select ST_AsMVTGeom(
             ST_SimplifyPreserveTopology(ST_ClipByBox2D(ST_Transform(a.geom, 3857), clip3857), tol),
             env3857, 4096, 64, true) as geom,
           a.id, a.name, a.level, a.region_type, a.root_region_id, a.parent_id,
           a.map_color_idx,
           a.source_dataset_id, a.source_type::text as source_type,
           a.is_official, a.is_informative, a.license, a.attribution
    from wine_areas a
    where a.level = 1
      and a.map_visible
      and a.geom is not null
      and a.geom && env4326
  ) q
  where q.geom is not null;
  if part is not null then tile := tile || part; end if;

  -- Sous-régions (2) and villages / appellations (3), from zoom 7 on, no
  -- upper cut: the client fades them under the crus and the vines.
  if z >= 7 then
    select ST_AsMVT(q, 'wine-areas-appellation', 4096, 'geom') into part
    from (
      select ST_AsMVTGeom(
               ST_SimplifyPreserveTopology(ST_ClipByBox2D(ST_Transform(a.geom, 3857), clip3857), tol),
               env3857, 4096, 64, true) as geom,
             a.id, a.name, a.level, a.region_type, a.root_region_id, a.parent_id,
             a.map_color_idx,
             a.source_dataset_id, a.source_type::text as source_type,
             a.is_official, a.is_informative, a.license, a.attribution
      from wine_areas a
      where a.level in (2, 3)
        and a.map_visible
        and a.geom is not null
        and a.geom && env4326
        and z >= floor(a.zoom_min)
    ) q
    where q.geom is not null;
    if part is not null then tile := tile || part; end if;
  end if;

  if z >= 10 then
    select ST_AsMVT(q, 'wine-areas-cru', 4096, 'geom') into part
    from (
      select ST_AsMVTGeom(
               ST_SimplifyPreserveTopology(ST_ClipByBox2D(ST_Transform(a.geom, 3857), clip3857), tol),
               env3857, 4096, 64, true) as geom,
             a.id, a.name, a.short_name, a.level, a.region_type, a.root_region_id, a.parent_id,
             a.map_color_idx,
             a.source_dataset_id, a.source_type::text as source_type,
             a.is_official, a.is_informative, a.license, a.attribution
      from wine_areas a
      where a.level in (4, 5)
        and a.map_visible
        and a.geom is not null
        and a.geom && env4326
        and z >= floor(a.zoom_min)
    ) q
    where q.geom is not null;
    if part is not null then tile := tile || part; end if;
  end if;

  -- One label point per area (ADR 0022): regions while zoomed out, then
  -- sous-régions / villages, then crus.
  select ST_AsMVT(q, 'wine-areas-labels', 4096, 'geom') into part
  from (
    select ST_AsMVTGeom(
             ST_Transform(coalesce(a.label_point, ST_PointOnSurface(a.geom)), 3857),
             env3857, 4096, 64, true) as geom,
           a.id, a.name, coalesce(a.short_name, a.name) as short_name,
           a.level, a.region_type, a.root_region_id, a.map_color_idx
    from wine_areas a
    where a.map_visible
      and a.geom is not null
      and a.geom && env4326
      and (
        (a.level = 1 and z <= 9)
        or (a.level in (2, 3) and z >= 6)
        or (a.level in (4, 5) and z >= 11)
      )
  ) q
  where q.geom is not null;
  if part is not null then tile := tile || part; end if;

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

  -- Planted vines, with their terrain, score (ADR 0016) and cru level (ADR 0021).
  if z >= 13 then
    select ST_AsMVT(q, 'wine-vine-plots', 4096, 'geom') into part
    from (
      select ST_AsMVTGeom(
               ST_SimplifyPreserveTopology(ST_Transform(v.geom, 3857), tol),
               env3857, 4096, 64, true) as geom,
             v.id, v.root_region_id, v.source, v.is_organic, v.commune_name, v.appellation, v.grand_cru,
             v.cru_level, v.premier_cru, v.village, v.secteur,
             v.lieu_dit, v.area_ha, v.altitude_m, v.slope_pct, v.aspect_deg,
             v.geol_notation, v.geol_descr, v.geol_family, v.soil_name,
             v.score_sun, v.score_cool, v.score_components::text as score_components,
             v.source_dataset_id, v.source_type::text as source_type
      from vine_plots v
      where v.geom && env4326
    ) q
    where q.geom is not null;
    if part is not null then tile := tile || part; end if;
  end if;

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

  -- One label point per lieu-dit (0014) + its area, so the client can drop
  -- a lieu-dit label that only repeats its cru's name (ADR 0022).
  if z >= 13 then
    select ST_AsMVT(q, 'wine-lieux-dits-labels', 4096, 'geom') into part
    from (
      select ST_AsMVTGeom(
               ST_Transform(coalesce(l.center, ST_PointOnSurface(l.geom)), 3857),
               env3857, 4096, 64, true) as geom,
             l.id, l.name,
             wa.name as area_name, wa.region_type as area_region_type
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
  'MVT layers for tile z/x/y: areas without upper zoom cut + one label point per area and colour slot (0017), INAO parcels, planted vine plots (0016), cadastral lieux-dits and their label points. Consumed by /api/tiles/wine.';
