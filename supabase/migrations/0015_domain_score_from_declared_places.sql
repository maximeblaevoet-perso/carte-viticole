-- 0015_domain_score_from_declared_places.sql
-- Reference domains are no longer given plots (ADR 0019). A domain's score is
-- composed from what it declares — grands crus and lieux-dits, each for its
-- declared or default surface — and, for the rest of its surface, the average
-- of the non-grand-cru vines of its communes. Computed offline by
-- scripts/build_alsace_vineyard.py. Append-only.
--
-- wine_domains: - the plot-assignment summary, + communes / composition.
-- vine_plots:   - domain_id / domain_distance_m / domain_via_cru.
-- wine_mvt:     wine-vine-plots without the domain fields (0014 otherwise).

drop view if exists public.wine_domains_api;

alter table wine_domains
  drop column if exists assigned_ha,
  drop column if exists coverage,
  drop column if exists n_plots,
  drop column if exists reach_m,
  drop column if exists mean_distance_m,
  drop column if exists max_distance_m,
  drop column if exists share_in_crus,
  drop column if exists assignment_confidence,
  -- Communes where the domain's vines are (declared, else the cellar's).
  add column if not exists communes text[] not null default '{}',
  -- Slices of the declared surface: [{kind: grand_cru | lieu_dit | reste, name,
  -- area_ha, basis: declaree | repartie | defaut | reste, vine_ha, score_sun,
  -- score_cool, distance_m, lon, lat, geometry (GeoJSON outline), grand_cru,
  -- lieux: [{commune, lieu_dit}], communes}]. Estimate, never a land registry.
  add column if not exists composition jsonb not null default '[]'::jsonb,
  -- Declared crus / lieux-dits that could not be located on the planted vines.
  add column if not exists unresolved_places text[] not null default '{}',
  add column if not exists score_confidence text
    check (score_confidence in ('haute', 'moyenne', 'basse'));

comment on column wine_domains.score_sun is
  'Composed score, "soleil" reading: declared places + communes average (ADR 0019)';
comment on column wine_domains.score_cool is
  'Composed score, "fraîcheur" reading (ADR 0019)';

-- Flat read model for /api/wine/domains (PostgREST cannot call ST_X in a select).
create or replace view public.wine_domains_api as
select d.id, d.root_region_id, d.name, d.commune, d.commune_insee,
       ST_X(d.location) as lon, ST_Y(d.location) as lat, d.coord_precision,
       d.surface_ha, d.surface_note, d.grands_crus, d.lieux_dits, d.communes, d.certification,
       d.sources, d.source_confidence,
       d.score_sun, d.score_cool, d.sector_score_sun, d.sector_score_cool,
       d.composition, d.unresolved_places, d.terroir, d.score_confidence, d.computed_at,
       d.source_dataset_id, d.source_type::text as source_type
from public.wine_domains d;

update source_datasets
set disclaimer = 'Surfaces, grands crus et lieux-dits déclarés publiquement, non vérifiés sur le terrain. Le score d''un domaine est composé de ses lieux déclarés et de la moyenne de ses communes : une estimation, jamais un relevé du casier viticole.'
where id = 'manual-alsace-domains';

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

  -- Planted vines, with their terrain and score (ADR 0016); no domain (ADR 0019).
  if z >= 13 then
    select ST_AsMVT(q, 'wine-vine-plots', 4096, 'geom') into part
    from (
      select ST_AsMVTGeom(
               ST_SimplifyPreserveTopology(ST_Transform(v.geom, 3857), tol),
               env3857, 4096, 64, true) as geom,
             v.id, v.source, v.is_organic, v.commune_name, v.appellation, v.grand_cru,
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

  -- One label point per lieu-dit: in Alsace a lieu-dit is now a multipolygon
  -- of planted vines (ADR 0017) and a polygon label repeats on every piece.
  if z >= 13 then
    select ST_AsMVT(q, 'wine-lieux-dits-labels', 4096, 'geom') into part
    from (
      select ST_AsMVTGeom(
               ST_Transform(coalesce(l.center, ST_PointOnSurface(l.geom)), 3857),
               env3857, 4096, 64, true) as geom,
             l.id, l.name
      from wine_lieux_dits l
      where l.geom is not null and l.geom && env4326
    ) q
    where q.geom is not null;
    if part is not null then tile := tile || part; end if;
  end if;

  return tile;
end;
$$;

drop index if exists vine_plots_domain_idx;
alter table vine_plots
  drop column if exists domain_id,
  drop column if exists domain_distance_m,
  drop column if exists domain_via_cru;

comment on function public.wine_mvt(integer, integer, integer) is
  'MVT layers for tile z/x/y: areas (map_visible, zoom bands), INAO parcels, planted vine plots with terroir score (0013, without domain since 0015), cadastral lieux-dits and one label point per lieu-dit (0014). Consumed by /api/tiles/wine.';
