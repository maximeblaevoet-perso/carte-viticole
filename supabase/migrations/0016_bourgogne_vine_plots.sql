-- 0016_bourgogne_vine_plots.sql
-- Planted vines, terroir score and reference domains for Bourgogne (ADR 0021),
-- built by scripts/build_vineyard.py --region bourgogne. Append-only.
--
-- vine_plots:    + cru_level (grand_cru | premier_cru | village | regional),
--                  premier_cru (climat name), village (communal appellation),
--                  secteur (Chablis, Côte de Nuits…, drives the altitude table).
-- wine_domains:  + premiers_crus, villages (declared, exact INAO names).
-- wine_mvt:      wine-vine-plots + root_region_id and the four fields above.

alter table vine_plots
  add column if not exists cru_level text
    check (cru_level in ('grand_cru', 'premier_cru', 'village', 'regional')),
  add column if not exists premier_cru text,
  add column if not exists village text,
  add column if not exists secteur text;

comment on column vine_plots.cru_level is
  'Highest INAO rank of the aires holding the plot centre (ADR 0021). Never an input of the score: used only to check it.';

-- Alsace rows predate the column: grand cru, else a complementary
-- denomination (communale / lieu-dit), else the regional AOC Alsace.
update vine_plots
set cru_level = case
  when grand_cru is not null then 'grand_cru'
  when appellation is not null and appellation <> 'Alsace' then 'village'
  else 'regional' end
where root_region_id = 'alsace' and cru_level is null;

create index if not exists vine_plots_cru_level_idx on vine_plots (root_region_id, cru_level);

drop view if exists public.wine_domains_api;

alter table wine_domains
  add column if not exists premiers_crus text[] not null default '{}',
  add column if not exists villages text[] not null default '{}';

create or replace view public.wine_domains_api as
select d.id, d.root_region_id, d.name, d.commune, d.commune_insee,
       ST_X(d.location) as lon, ST_Y(d.location) as lat, d.coord_precision,
       d.surface_ha, d.surface_note, d.grands_crus, d.premiers_crus, d.villages,
       d.lieux_dits, d.communes, d.certification,
       d.sources, d.source_confidence,
       d.score_sun, d.score_cool, d.sector_score_sun, d.sector_score_cool,
       d.composition, d.unresolved_places, d.terroir, d.score_confidence, d.computed_at,
       d.source_dataset_id, d.source_type::text as source_type
from public.wine_domains d;

insert into source_datasets (id, name, provider, source_url, license, attribution, disclaimer, update_notes)
values (
  'manual-bourgogne-domains',
  'Domaines de référence de Bourgogne (compilation)',
  'Compilation manuelle (sites des domaines, guides, presse)',
  null,
  null,
  'Voir les sources de chaque domaine',
  'Surfaces, grands crus, premiers crus et villages déclarés publiquement, non vérifiés sur le terrain. Le score d''un domaine est composé de ses lieux déclarés et de la moyenne de ses communes : une estimation, jamais un relevé du casier viticole.',
  'scripts/data/bourgogne-domains.json'
)
on conflict (id) do nothing;

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

comment on function public.wine_mvt(integer, integer, integer) is
  'MVT layers for tile z/x/y: areas (map_visible, zoom bands), INAO parcels, planted vine plots with terroir score and cru level (0016), cadastral lieux-dits and one label point per lieu-dit (0014). Consumed by /api/tiles/wine.';
