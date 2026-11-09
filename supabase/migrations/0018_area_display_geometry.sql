-- 0018_area_display_geometry.sql
-- Smoothed display geometry for régions, secteurs and villages (ADR 0022,
-- second pass after an on-screen review). Append-only.
--
-- An INAO aire is a patchwork of plots: drawn as is, a secteur is a jagged
-- line around hundreds of fragments, a village a mesh of internal edges, and
-- an along-the-line name repeats on every edge. For levels 1-3 we keep the
-- exact `geom` (data, clicks, crus, vines) and add `geom_display`:
-- union → closing (buffer +d then -d, in Lambert-93) → drop specks →
-- simplify. d = 600 m (région), 400 m (secteur), 60 m (village).
-- wine_mvt draws levels 1-3 from geom_display; crus keep their exact shape.

alter table wine_areas
  add column if not exists geom_display geometry(MultiPolygon, 4326);

comment on column wine_areas.geom_display is
  'Smoothed outline of a level 1-3 area, for map display only (ADR 0022). Never data: geom stays the reference.';

create or replace function public.wine_areas_refresh_display_geom(p_root text default null)
returns void
language plpgsql
as $$
begin
  update wine_areas a
  set geom_display = s.g
  from (
    select x.id,
           ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_Transform(
             ST_SimplifyPreserveTopology(
               coalesce(
                 -- drop isolated specks (< min_m2) unless nothing else is left
                 (select ST_Union(d.geom) from ST_Dump(x.closed) d
                  where ST_Area(d.geom) >= x.min_m2),
                 x.closed),
               x.simp),
             4326)), 3)) as g
    from (
      select a2.id, p.simp, p.min_m2,
             ST_Buffer(
               ST_Buffer(ST_UnaryUnion(ST_MakeValid(ST_Transform(a2.geom, 2154))), p.d, 'quad_segs=4'),
               -p.d, 'quad_segs=4') as closed
      from wine_areas a2
      join (values (1, 600.0, 60.0, 200000.0),
                   (2, 400.0, 40.0, 100000.0),
                   (3,  60.0,  6.0,      0.0)) as p(level, d, simp, min_m2)
        on p.level = a2.level
      where a2.geom is not null
        and a2.map_visible
        and (p_root is null or a2.root_region_id = p_root)
    ) x
  ) s
  where a.id = s.id;
end;
$$;

comment on function public.wine_areas_refresh_display_geom(text) is
  'Recomputes geom_display (smoothed outline) of level 1-3 areas (ADR 0022). Null = every region.';

-- Same as 0017, plus the display geometry first and label anchors taken on it.
create or replace function public.wine_areas_refresh_map_style(p_root text default null)
returns void
language plpgsql
as $$
declare
  r record;
  used smallint[];
  pick smallint;
begin
  perform public.wine_areas_refresh_display_geom(p_root);

  update wine_areas a
  set label_point = (
        select ST_PointOnSurface(d.geom)
        from ST_Dump(coalesce(a.geom_display, a.geom)) d
        order by ST_Area(d.geom) desc
        limit 1),
      short_name = case
        when a.level >= 4 then
          nullif(btrim(regexp_replace(a.name, '^.*\m(premier|grand) cru\s+', '', 'i')), '')
        else null end
  where a.geom is not null
    and (p_root is null or a.root_region_id = p_root);

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
  'Recomputes geom_display, label_point, short_name and map_color_idx (ADR 0022). Null = every region.';

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
             ST_SimplifyPreserveTopology(ST_ClipByBox2D(ST_Transform(coalesce(a.geom_display, a.geom), 3857), clip3857), tol),
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
               ST_SimplifyPreserveTopology(ST_ClipByBox2D(ST_Transform(coalesce(a.geom_display, a.geom), 3857), clip3857), tol),
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
  'MVT layers for tile z/x/y: régions / secteurs / villages drawn from their smoothed display geometry (0018), areas without upper zoom cut + one label point per area and colour slot (0017), INAO parcels, planted vine plots (0016), cadastral lieux-dits and their label points. Consumed by /api/tiles/wine.';
