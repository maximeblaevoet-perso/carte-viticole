-- 0022_cru_display_geometry.sql
-- Crus drawn without the slivers of their INAO patchwork (ADR 0025,
-- review 2026-11-23). Append-only.
--
-- A grand / premier cru is the union of INAO plots: the union leaves
-- sliver holes (< 1 m wide) and narrow notches. Drawn as is, each becomes a
-- short line inside the cru, doubling its outline (Alsace grand cru
-- Sommerberg: 7 holes of 0-73 m2). Like levels 1-3 in 0018, crus get a
-- display-only `geom_display`: closing by 3 m (buffer +3 then -3, Lambert-93)
-- fills every gap narrower than 6 m, then enclosed holes under 2 500 m2 are
-- dropped (real enclaves stay); Sommerberg gains 0.06 ha on 27.7 ha. `geom` stays the reference (data, clicks, vines).

create or replace function public.wine_areas_refresh_cru_display_geom(p_root text default null)
returns void
language plpgsql
as $$
begin
  update wine_areas a
  set geom_display = s.g
  from (
    select x.id,
           ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_Transform(ST_SimplifyPreserveTopology(
             -- rebuild each part without its holes under 2 500 m2: the closing
             -- turns near-touching parts into small enclosed gaps
             (select ST_Collect(ST_MakePolygon(
                       ST_ExteriorRing(d.geom),
                       array(select ST_ExteriorRing(r.geom)
                             from ST_DumpRings(d.geom) r
                             where r.path[1] > 0 and ST_Area(r.geom) >= 2500)))
              from ST_Dump(x.closed) d
              where ST_GeometryType(d.geom) = 'ST_Polygon'),
             0.5), 4326)), 3)) as g
    from (
      select a2.id,
             ST_Buffer(
               ST_Buffer(ST_UnaryUnion(ST_MakeValid(ST_Transform(a2.geom, 2154))), 3.0, 'quad_segs=2'),
               -3.0, 'quad_segs=2') as closed
      from wine_areas a2
      where a2.level in (4, 5)
        and a2.geom is not null
        and a2.map_visible
        and (p_root is null or a2.root_region_id = p_root)
    ) x
  ) s
  where a.id = s.id;
end;
$$;

comment on function public.wine_areas_refresh_cru_display_geom(text) is
  'Display outline of grands / premiers crus without union slivers: closing by 3 m (ADR 0025). Null = every region.';

-- Same as 0020, crus drawn from geom_display when present.
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
           a.map_color_idx, a.reveal_zoom,
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
             a.map_color_idx, a.reveal_zoom, pa.reveal_zoom as parent_reveal_zoom,
             a.source_dataset_id, a.source_type::text as source_type,
             a.is_official, a.is_informative, a.license, a.attribution
      from wine_areas a
      left join wine_areas pa on pa.id = a.parent_id
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
               ST_SimplifyPreserveTopology(ST_ClipByBox2D(ST_Transform(coalesce(a.geom_display, a.geom), 3857), clip3857), tol),
               env3857, 4096, 64, true) as geom,
             a.id, a.name, a.short_name, a.level, a.region_type, a.root_region_id, a.parent_id,
             a.map_color_idx, a.reveal_zoom, pa.reveal_zoom as parent_reveal_zoom,
             a.source_dataset_id, a.source_type::text as source_type,
             a.is_official, a.is_informative, a.license, a.attribution
      from wine_areas a
      left join wine_areas pa on pa.id = a.parent_id
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
           a.level, a.region_type, a.root_region_id, a.map_color_idx,
           a.reveal_zoom, pa.reveal_zoom as parent_reveal_zoom
    from wine_areas a
    left join wine_areas pa on pa.id = a.parent_id
    where a.map_visible
      and a.geom is not null
      and a.geom && env4326
      and (
        (a.level = 1 and z <= 9)
        or (a.level in (2, 3) and z >= 6)
        or (a.level in (4, 5) and z >= 10)
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
  -- From z11 where their local context fills the screen early (ADR 0025): a
  -- z tile is drawn up to z+1, and a small screen reveals up to 0.5 earlier.
  if z >= 11 then
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
             v.source_dataset_id, v.source_type::text as source_type,
             r.rz as reveal_zoom
      from vine_plots v
      left join vine_commune_reveal vc on vc.commune_insee = v.commune_insee
      left join wine_areas wa on wa.id = v.wine_area_id
      cross join lateral (
        select least(13.0, greatest(11.5, least(
                 coalesce(vc.reveal_zoom, 13.0),
                 coalesce(case when wa.level >= 3 and wa.reveal_zoom >= 11.5 then wa.reveal_zoom end, 13.0)
               )))::real as rz
      ) r
      where v.geom && env4326
        and (z >= 13 or r.rz < z + 1.5)
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

-- Not run by this file. Then, ONE PER RUN in the SQL editor:
--   select public.wine_areas_refresh_cru_display_geom('alsace');
--   select public.wine_areas_refresh_cru_display_geom('bourgogne');
--   select public.wine_areas_refresh_cru_display_geom('champagne');
-- Check: select count(*) from wine_areas where level in (4, 5) and geom_display is not null;
-- (After a re-ingestion of a region, run it again with the region.)
