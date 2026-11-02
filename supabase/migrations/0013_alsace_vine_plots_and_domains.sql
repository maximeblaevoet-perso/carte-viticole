-- 0013_alsace_vine_plots_and_domains.sql
-- Planted vines (not delimited aires), terroir score per plot, and reference
-- domains with an *estimated* plot set. Append-only. See ADR 0016.
--
-- The INAO "parcellaire" ingested so far is an aire délimitée per
-- commune × denomination: it covers forest, orchards and houses as much as
-- vines. vine_plots holds what is actually planted — RPG declarations (crop
-- group 21) completed by BD TOPO "Vigne" polygons where the RPG has nothing —
-- clipped to the AOC aire and enriched offline by
-- scripts/build_alsace_vineyard.py (geology, relief, soil, score, domain).

-- ---------------------------------------------------------------------------
-- Provenance catalog entries.
-- ---------------------------------------------------------------------------
insert into source_datasets (id, name, provider, source_url, license, attribution, disclaimer, update_notes)
values
  (
    'ign-bdtopo',
    'BD TOPO IGN — zones de végétation « Vigne »',
    'IGN / Géoplateforme',
    'https://geoservices.ign.fr/bdtopo',
    'Licence Ouverte / Etalab',
    'IGN — BD TOPO',
    'Photo-interprétation : vigne visible sur l''orthophoto, non déclarée à la PAC. Peut inclure des vignes arrachées récemment.',
    'WFS BDTOPO_V3:zone_de_vegetation, nature = Vigne. Gardé seulement là où le RPG n''a rien (différence géométrique), polygones > 0,15 ha.'
  ),
  (
    'ign-rge-alti',
    'RGE ALTI IGN — altitude',
    'IGN / Géoplateforme',
    'https://geoservices.ign.fr/rgealti',
    'Licence Ouverte / Etalab',
    'IGN — RGE ALTI',
    'Pente et exposition calculées sur 5 points (centre ± 30 m) : valeur locale, pas une moyenne de parcelle.',
    'Service altimétrique Géoplateforme, ressource ign_rge_alti_wld.'
  ),
  (
    'inrae-rrp',
    'Carte des sols — sols dominants (RRP 1/250 000)',
    'INRAE / Gis Sol',
    'https://www.gissol.fr/donnees/cartes/carte-des-sols-de-france',
    'Licence Ouverte / Etalab',
    'INRAE — Gis Sol, RRP',
    'Sol dominant d''une unité cartographique au 1/250 000 : un paysage de sols, pas le sol de la parcelle.',
    'WFS INRAE_CARTE-SOLS:sols_dominants_france_metropolitaine.'
  ),
  (
    'manual-alsace-domains',
    'Domaines de référence d''Alsace (compilation)',
    'Compilation manuelle (sites des domaines, guides, presse)',
    null,
    null,
    'Voir les sources de chaque domaine',
    'Surfaces et adresses déclarées publiquement, non vérifiées sur le terrain. Les parcelles attribuées à un domaine sont une estimation géographique, jamais un relevé du casier viticole.',
    'scripts/data/alsace-domains.json'
  )
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- wine_domains: reference estates (manual list) + computed terroir summary.
-- ---------------------------------------------------------------------------
create table if not exists wine_domains (
  id                    text primary key,
  root_region_id        text not null references wine_regions (id) on delete cascade,
  name                  text not null,
  commune               text,
  commune_insee         text,
  location              geometry(Point, 4326) not null,
  coord_precision       text check (coord_precision in ('adresse', 'commune')),
  -- Declared (manual)
  surface_ha            numeric,
  surface_note          text,
  grands_crus           text[] not null default '{}',
  lieux_dits            text[] not null default '{}',
  certification         text,
  sources               jsonb not null default '[]'::jsonb,
  source_confidence     text check (source_confidence in ('haute', 'moyenne', 'basse')),
  -- Computed by scripts/build_alsace_vineyard.py (estimate)
  assigned_ha           numeric,
  coverage              numeric,          -- assigned_ha / surface_ha
  n_plots               integer,
  reach_m               numeric,          -- max cellar distance for ordinary plots
  mean_distance_m       numeric,
  max_distance_m        numeric,
  share_in_crus         numeric,          -- share of assigned_ha claimed via a declared grand cru
  score_sun             numeric,          -- area-weighted plot score, "soleil" reading
  score_cool            numeric,          -- idem, "fraîcheur" reading
  sector_score_sun      numeric,          -- every vine within 1.5 km of the cellar
  sector_score_cool     numeric,
  terroir               jsonb not null default '{}'::jsonb,
  assignment_confidence text check (assignment_confidence in ('haute', 'moyenne', 'basse')),
  computed_at           timestamptz,
  -- Provenance
  source_dataset_id     text references source_datasets (id) on delete set null default 'manual-alsace-domains',
  source_type           source_type not null default 'manual',
  created_at            timestamptz not null default now()
);

create index if not exists wine_domains_root_region_idx on wine_domains (root_region_id);
create index if not exists wine_domains_location_gix on wine_domains using gist (location);

-- Flat read model for /api/wine/domains (PostgREST cannot call ST_X in a select).
create or replace view public.wine_domains_api as
select d.id, d.root_region_id, d.name, d.commune, d.commune_insee,
       ST_X(d.location) as lon, ST_Y(d.location) as lat, d.coord_precision,
       d.surface_ha, d.surface_note, d.grands_crus, d.lieux_dits, d.certification,
       d.sources, d.source_confidence,
       d.assigned_ha, d.coverage, d.n_plots, d.reach_m, d.mean_distance_m, d.max_distance_m,
       d.share_in_crus, d.score_sun, d.score_cool, d.sector_score_sun, d.sector_score_cool,
       d.terroir, d.assignment_confidence, d.computed_at,
       d.source_dataset_id, d.source_type::text as source_type
from public.wine_domains d;

-- ---------------------------------------------------------------------------
-- vine_plots: one planted vine polygon (RPG parcel or BD TOPO zone).
-- ---------------------------------------------------------------------------
create table if not exists vine_plots (
  id                    text primary key,       -- 'rpg-<num_parcel>' | 'bdt-<cleabs>-<n>'
  root_region_id        text not null references wine_regions (id) on delete cascade,
  source                text not null check (source in ('rpg', 'bdtopo')),
  source_ref            text,
  rpg_culture_code      text,                   -- VRC, VRT…
  is_organic            boolean,                -- RPG only; null = unknown (BD TOPO)
  commune_insee         text,
  commune_name          text,
  appellation           text,                   -- most specific INAO denomination
  grand_cru             text,
  wine_area_id          text references wine_areas (id) on delete set null,
  lieu_dit              text,                   -- cadastral lieu-dit at the plot centre
  area_ha               numeric not null,
  center                geometry(Point, 4326),
  geom                  geometry(MultiPolygon, 4326) not null,
  -- Terrain
  altitude_m            numeric,
  slope_pct             numeric,
  aspect_deg            numeric,                -- downslope direction, 0 = N
  geol_notation         text,
  geol_descr            text,
  geol_family           text,
  geol_dominant_share   numeric,
  soil_name             text,
  -- Score (src/data/terroir-score-alsace.json)
  score_sun             numeric,
  score_cool            numeric,
  score_components      jsonb,                  -- each criterion in [0, 1]
  -- Estimated domain (scripts/terroir_score.py:assign_domains)
  domain_id             text references wine_domains (id) on delete set null,
  domain_distance_m     numeric,
  domain_via_cru        boolean,
  -- Provenance
  source_dataset_id     text references source_datasets (id) on delete set null,
  source_type           source_type not null default 'real',
  created_at            timestamptz not null default now()
);

create index if not exists vine_plots_geom_gix on vine_plots using gist (geom);
create index if not exists vine_plots_root_region_idx on vine_plots (root_region_id);
create index if not exists vine_plots_domain_idx on vine_plots (domain_id) where domain_id is not null;

-- ---------------------------------------------------------------------------
-- prune_alsace_vineless_geodata(): lighten the database once vine_plots exists.
--
-- * Alsace wine_parcels are INAO aires (commune × denomination), not plots:
--   the map now shows planted vines instead. The grand-cru contours already
--   dissolved from them live in wine_areas and are not touched.
-- * Alsace lieux-dits that contain no planted vine are forest, town or field.
--
-- Refuses to run while vine_plots holds no Alsace row, so it can never wipe
-- the lieux-dits before the vines are loaded. Not callable from the browser.
-- ---------------------------------------------------------------------------
create or replace function public.prune_alsace_vineless_geodata()
returns jsonb
language plpgsql
volatile
as $$
declare
  n_parcels integer;
  n_lieux integer;
begin
  if not exists (select 1 from vine_plots where root_region_id = 'alsace') then
    raise exception 'vine_plots has no Alsace row: load the vines before pruning';
  end if;

  delete from wine_parcels
  where source_dataset_id = 'inao-parcellaire'
    and (commune_insee like '67%' or commune_insee like '68%');
  get diagnostics n_parcels = row_count;

  delete from wine_lieux_dits l
  where (l.commune_insee like '67%' or l.commune_insee like '68%')
    and not exists (
      select 1 from vine_plots v
      where v.root_region_id = 'alsace'
        and v.geom && l.geom
        and ST_Intersects(v.geom, l.geom)
    );
  get diagnostics n_lieux = row_count;

  return jsonb_build_object('wine_parcels_deleted', n_parcels, 'lieux_dits_deleted', n_lieux);
end;
$$;

revoke all on function public.prune_alsace_vineless_geodata() from public, anon, authenticated;
grant execute on function public.prune_alsace_vineless_geodata() to service_role;

-- ---------------------------------------------------------------------------
-- wine_mvt: + wine-vine-plots layer (z >= 13). Other layers unchanged (0010).
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

  -- Planted vines, with their terrain and score (ADR 0016).
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
             v.domain_id, d.name as domain_name, v.domain_distance_m, v.domain_via_cru,
             v.source_dataset_id, v.source_type::text as source_type
      from vine_plots v
      left join wine_domains d on d.id = v.domain_id
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

  return tile;
end;
$$;

comment on function public.wine_mvt(integer, integer, integer) is
  'MVT layers for tile z/x/y: areas (map_visible, zoom bands), INAO parcels, planted vine plots with terroir score (0013), cadastral lieux-dits. Consumed by /api/tiles/wine.';
