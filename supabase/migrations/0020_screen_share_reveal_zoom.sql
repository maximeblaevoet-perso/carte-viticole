-- 0020_screen_share_reveal_zoom.sql
-- Map levels revealed by screen share, not by one global zoom band per level
-- (ADR 0025). Append-only. Apply in the SQL editor; the client already bumps
-- the tiles version (src/lib/wine-tiles.ts).
--
-- Rule (same family as OpenMapTiles' `way_pixels` or Tippecanoe's area-based
-- minzoom): a place hands over to its children when its extent fills 60 % of
-- the short side of the screen. `reveal_zoom` is that zoom for a reference
-- 1024 px short side; the client shifts it by log2(short side / 1024).
--
--   reveal_zoom = log2( 0.6 * 1024 / (512 * max(dx, dy) / C) )
--
-- dx, dy = extent in Web Mercator metres, C = earth circumference (one 512 px
-- tile at z0). Châteauneuf-du-Pape -> 12.0, Vaucluse rhodanien -> 9.2,
-- Alsace Val Saint Grégoire -> 11.6, Côte de Nuits-Villages -> 10.7.
--
-- Planted vines get the reveal zoom of their local context: the smaller of
-- their commune's vineyard extent (table vine_commune_reveal) and their
-- village / cru appellation (when appellation-sized, i.e. reveal >= 11.5),
-- clamped to [11.5, 13]: never later than before (13), never at a scale where
-- vine tiles get heavy. Derived in wine_mvt: vine_plots is never rewritten.

alter table wine_areas add column if not exists reveal_zoom real;
-- A first draft stored it on every vine: rewriting all of vine_plots timed
-- out in the SQL editor. The vine reveal is now derived in the tiles from
-- the small table below + wine_areas.reveal_zoom.
alter table vine_plots drop column if exists reveal_zoom;

comment on column wine_areas.reveal_zoom is
  'Zoom at which the area fills 60 % of a 1024 px screen short side: its children take over (ADR 0025). Display only.';

-- Vineyard extent of each commune (planted vines only), as a reveal zoom.
create table if not exists vine_commune_reveal (
  commune_insee text primary key,
  root_region_id text,
  reveal_zoom real not null
);

comment on table vine_commune_reveal is
  'Reveal zoom of the planted vineyard of each commune (ADR 0025): vines show once it fills ~60 % of the screen. Display only, rebuilt by wine_map_refresh_reveal_zoom.';

create or replace function public.map_reveal_zoom(g geometry)
returns real
language sql
immutable
parallel safe
as $$
  select (ln(0.6 * 1024.0 / (512.0 * greatest(ST_XMax(e) - ST_XMin(e), ST_YMax(e) - ST_YMin(e), 1.0)
                             / 40075016.6855785)) / ln(2.0))::real
  from (select ST_Transform(ST_Envelope(g), 3857) as e) s
$$;

comment on function public.map_reveal_zoom(geometry) is
  'Zoom at which a WGS84 geometry''s extent spans 60 % of a 1024 px screen side (ADR 0025).';

create or replace function public.wine_map_refresh_reveal_zoom(p_root text default null)
returns void
language plpgsql
as $$
begin
  update wine_areas a
  set reveal_zoom = public.map_reveal_zoom(a.geom)
  where a.geom is not null
    and (p_root is null or a.root_region_id = p_root);

  -- Only reads vine_plots (no rewrite): one row per commune.
  delete from vine_commune_reveal
  where p_root is null or root_region_id = p_root;

  insert into vine_commune_reveal (commune_insee, root_region_id, reveal_zoom)
  select commune_insee,
         min(root_region_id),
         public.map_reveal_zoom(ST_SetSRID(ST_Extent(geom)::geometry, 4326))
  from vine_plots
  where commune_insee is not null
    and (p_root is null or root_region_id = p_root)
  group by commune_insee
  on conflict (commune_insee) do update
    set reveal_zoom = excluded.reveal_zoom, root_region_id = excluded.root_region_id;
end;
$$;

comment on function public.wine_map_refresh_reveal_zoom(text) is
  'Recomputes wine_areas.reveal_zoom and vine_commune_reveal (ADR 0025). Null = every region.';

-- Same as 0018, plus the reveal zooms at the end: still one command after an ingest.
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

  -- Screen-share reveal zooms (ADR 0025).
  perform public.wine_map_refresh_reveal_zoom(p_root);
end;
$$;

-- Same as 0018: areas carry their own and their parent's reveal_zoom, crus'
-- label points ship from z10, vines from z11 where their context is revealed early.
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
               ST_SimplifyPreserveTopology(ST_ClipByBox2D(ST_Transform(a.geom, 3857), clip3857), tol),
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

comment on function public.wine_mvt(integer, integer, integer) is
  'MVT layers for tile z/x/y: régions / secteurs / villages from their smoothed display geometry (0018), with their own and parent reveal_zoom (0020), one label point per area (0017), INAO parcels, planted vine plots from z11 by reveal_zoom (0020), cadastral lieux-dits and their label points. Consumed by /api/tiles/wine.';

-- Then, as a separate run (one region per run if the editor times out):
--   select public.wine_map_refresh_reveal_zoom('alsace');
--   select public.wine_map_refresh_reveal_zoom('bourgogne');
--   select public.wine_map_refresh_reveal_zoom('rhone');
--   select public.wine_map_refresh_reveal_zoom('champagne');
