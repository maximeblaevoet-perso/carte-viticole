-- 0005_wine_geodata.sql
-- Hybrid PostGIS storage for hierarchical wine areas + fine parcels (high zoom).
-- Append-only. Prepares Alsace, Champagne, extensible Bourgogne structure.
-- No geometry rows imported here — schema + public source catalog only.

create extension if not exists postgis;

-- ---------------------------------------------------------------------------
-- source_datasets: provenance catalog for ingested geodata (not geometry).
-- ---------------------------------------------------------------------------
create table if not exists source_datasets (
  id                text primary key,
  name              text not null,
  provider          text,
  source_url        text,
  license           text,
  attribution       text,
  disclaimer        text,
  update_notes      text,
  source_updated_at timestamptz,
  created_at        timestamptz not null default now()
);

-- Public datasets we plan to ingest (metadata only — no invented geometries).
insert into source_datasets (id, name, provider, source_url, license, attribution, disclaimer, update_notes)
values
  (
    'inao-siqo',
    'Référentiel SIQO INAO',
    'INAO / data.gouv.fr',
    'https://www.data.gouv.fr/datasets/referentiel-des-produits-sous-signe-officiel-didentification-de-la-qualite-et-de-lorigine-siqo',
    'Licence Ouverte / Etalab',
    'INAO — data.gouv.fr',
    null,
    'Référentiel produits AOC/AOP/IGP ; pas de géométrie parcellaire.'
  ),
  (
    'inao-aires-aop-igp',
    'Aires et produits AOC/AOP et IGP',
    'INAO / data.gouv.fr',
    'https://www.data.gouv.fr/datasets/aires-et-produits-aoc-aop-et-igp',
    'Licence Ouverte / Etalab',
    'INAO — data.gouv.fr',
    'Contours informatifs ; limites officielles = plans INAO/mairie.',
    'Géométries d''aires d''appellation.'
  ),
  (
    'inao-parcellaire',
    'Délimitation parcellaire des AOC viticoles INAO',
    'INAO / data.gouv.fr',
    'https://www.data.gouv.fr/datasets/delimitation-parcellaire-des-aoc-viticoles-de-linao',
    'Licence Ouverte / Etalab',
    'INAO — data.gouv.fr',
    'Donnée informative ; limites officielles = plans INAO/mairie.',
    'Champs connus : dt, type_prod, catégorie, type_denom, signe, id_app, app, id_denom, denom, insee, nomcom, id_aire.'
  ),
  (
    'ign-rpg',
    'RPG IGN (Registre Parcellaire Graphique)',
    'IGN / cartes.gouv.fr',
    'https://cartes.gouv.fr/aide/fr/partenaires/ign/referentiels-description-territoire/vegetation-agriculture/rpg/',
    'Voir conditions IGN',
    'IGN',
    'Enrichissement parcelle déclarée vigne — pas source juridique.',
    'Usage complémentaire au parcellaire INAO.'
  ),
  (
    'etalab-cadastre',
    'Cadastre Etalab',
    'Etalab / data.gouv.fr',
    'https://cadastre.data.gouv.fr/datasets',
    'Licence Ouverte / Etalab',
    'Direction générale des Finances publiques — Etalab',
    null,
    'Parcelles cadastrales et lieux-dits.'
  )
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- wine_areas: hierarchical navigation (region → appellation → cru → climat).
-- Does NOT store every cadastral parcel — see wine_parcels.
-- ---------------------------------------------------------------------------
create table if not exists wine_areas (
  id                    text primary key,
  name                  text not null,
  level                 smallint not null check (level between 1 and 5),
  parent_id             text references wine_areas (id) on delete cascade,
  root_region_id        text not null references wine_regions (id) on delete cascade,
  region_type           text not null,
  center                geometry(Point, 4326),
  geom                  geometry(MultiPolygon, 4326),
  zoom_min              numeric not null default 0,
  zoom_max              numeric not null default 0,
  available_data_scopes jsonb not null default '[]'::jsonb,
  blurb                 text,
  provisional           boolean not null default true,
  -- External identifiers (INGEST keys — nullable until imported)
  inao_id_app           text,
  inao_id_denom         text,
  insee_commune         text,
  -- Provenance
  source_dataset_id     text references source_datasets (id) on delete set null,
  source_type           source_type not null default 'synthetic',
  is_official           boolean not null default false,
  is_informative        boolean not null default false,
  source_updated_at     timestamptz,
  license               text,
  attribution           text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists wine_areas_parent_idx on wine_areas (parent_id);
create index if not exists wine_areas_root_region_idx on wine_areas (root_region_id);
create index if not exists wine_areas_level_idx on wine_areas (level);
create index if not exists wine_areas_geom_gix on wine_areas using gist (geom);
create index if not exists wine_areas_center_gix on wine_areas using gist (center);
create index if not exists wine_areas_inao_app_idx on wine_areas (inao_id_app)
  where inao_id_app is not null;
create index if not exists wine_areas_insee_idx on wine_areas (insee_commune)
  where insee_commune is not null;

-- ---------------------------------------------------------------------------
-- wine_parcels: fine parcels shown only at high zoom (separate from hierarchy).
-- ---------------------------------------------------------------------------
create table if not exists wine_parcels (
  id                    text primary key,
  commune_insee         text,
  parcel_ref            text,
  name                  text,
  center                geometry(Point, 4326),
  geom                  geometry(MultiPolygon, 4326) not null,
  area_ha               numeric,
  zoom_min              numeric not null default 14,
  -- External identifiers
  inao_id_aire          text,
  rpg_plot_id           text,
  cadastre_section      text,
  cadastre_numero       text,
  -- Provenance
  source_dataset_id     text references source_datasets (id) on delete set null,
  source_type           source_type not null default 'synthetic',
  is_official           boolean not null default false,
  is_informative        boolean not null default true,
  source_updated_at     timestamptz,
  license               text,
  attribution           text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists wine_parcels_geom_gix on wine_parcels using gist (geom);
create index if not exists wine_parcels_center_gix on wine_parcels using gist (center);
create index if not exists wine_parcels_commune_idx on wine_parcels (commune_insee);
create index if not exists wine_parcels_inao_aire_idx on wine_parcels (inao_id_aire)
  where inao_id_aire is not null;

-- ---------------------------------------------------------------------------
-- wine_area_parcels: many-to-many link area ↔ parcel (no hierarchy explosion).
-- ---------------------------------------------------------------------------
create table if not exists wine_area_parcels (
  wine_area_id      text not null references wine_areas (id) on delete cascade,
  wine_parcel_id    text not null references wine_parcels (id) on delete cascade,
  relationship      text not null default 'contains',
  source_dataset_id text references source_datasets (id) on delete set null,
  source_type       source_type not null default 'synthetic',
  created_at        timestamptz not null default now(),
  primary key (wine_area_id, wine_parcel_id)
);

create index if not exists wine_area_parcels_parcel_idx
  on wine_area_parcels (wine_parcel_id);

-- ---------------------------------------------------------------------------
-- wine_lieux_dits: cadastral lieux-dits (Champagne parcels → lieu-dit label).
-- ---------------------------------------------------------------------------
create table if not exists wine_lieux_dits (
  id                    text primary key,
  name                  text not null,
  commune_insee         text,
  wine_area_id          text references wine_areas (id) on delete set null,
  center                geometry(Point, 4326),
  geom                  geometry(MultiPolygon, 4326),
  cadastre_source_ref   text,
  -- Provenance
  source_dataset_id     text references source_datasets (id) on delete set null,
  source_type           source_type not null default 'synthetic',
  is_official           boolean not null default false,
  is_informative        boolean not null default false,
  source_updated_at     timestamptz,
  license               text,
  attribution           text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists wine_lieux_dits_geom_gix on wine_lieux_dits using gist (geom);
create index if not exists wine_lieux_dits_center_gix on wine_lieux_dits using gist (center);
create index if not exists wine_lieux_dits_area_idx on wine_lieux_dits (wine_area_id);
create index if not exists wine_lieux_dits_commune_idx on wine_lieux_dits (commune_insee);
