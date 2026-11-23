-- 0021_lighter_reveal_refresh.sql
-- Lighter refresh of the screen-share reveal zooms (ADR 0025). Append-only.
--
-- 0020 measured each commune's vineyard on the full vine polygons: on the
-- Rhône that read every toasted geometry and hit the statement timeout. The
-- extent of the plot centres (`center`, a small inline point) is enough for a
-- reveal zoom: it is short by at most half a plot (~100 m on a 5-10 km
-- vineyard, < 0.03 zoom level).

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
         public.map_reveal_zoom(ST_SetSRID(ST_Extent(coalesce(center, ST_PointOnSurface(geom)))::geometry, 4326))
  from vine_plots
  where commune_insee is not null
    and (p_root is null or root_region_id = p_root)
  group by commune_insee
  on conflict (commune_insee) do update
    set reveal_zoom = excluded.reveal_zoom, root_region_id = excluded.root_region_id;
end;
$$;

comment on function public.wine_map_refresh_reveal_zoom(text) is
  'Recomputes wine_areas.reveal_zoom and vine_commune_reveal from the plot centres (ADR 0025). Null = every region.';

-- Not run by this file. Then, ONE PER RUN in the SQL editor:
--   select public.wine_map_refresh_reveal_zoom('alsace');
--   select public.wine_map_refresh_reveal_zoom('bourgogne');
--   select public.wine_map_refresh_reveal_zoom('rhone');
--   select public.wine_map_refresh_reveal_zoom('champagne');
-- Check: select count(*) from vine_commune_reveal;  -- ≈ 980 communes
