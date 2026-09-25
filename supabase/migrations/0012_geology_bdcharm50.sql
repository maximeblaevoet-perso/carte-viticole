-- 0012_geology_bdcharm50.sql
-- Subsoil at 1/50 000 — BRGM BD Charm-50 (géologie harmonisée), clipped to the
-- delimited vineyard. Append-only. See ADR 0014.
--
-- Replaces the BRGM `LITHO_1M_SIMPLIFIEE` WMS call that used to answer the
-- "what is under this plot?" card. That layer is the only *queryable* national
-- one BRGM publishes, and at 1/1 000 000 it is not a generalisation of the
-- geological map but a separate drawing: over Alsace one 155 km² polygon
-- labelled "Basaltes et rhyolites" covers eleven grands crus that sit on
-- Jurassic limestone (Steinert, Hengst, Goldert, Zinnkoepflé…), while the
-- Rangen de Thann — the one genuinely volcanic cru — is returned as "Sables".
--
-- BD Charm-50 is vector, free, and accurate at the scale of a cru, but is not
-- served as a queryable API: it is ingested here and queried with PostGIS.

-- ---------------------------------------------------------------------------
-- Provenance catalog entry.
-- ---------------------------------------------------------------------------
insert into source_datasets (
  id, name, provider, source_url, license, attribution, disclaimer, update_notes
)
values (
  'brgm-bdcharm50',
  'BD Charm-50 — carte géologique harmonisée au 1/50 000',
  'BRGM / InfoTerre',
  'https://infoterre.brgm.fr/page/telechargement-bdcharm50',
  'Licence Ouverte / Etalab',
  'BRGM — BD Charm-50',
  'Carte géologique au 1/50 000 : nature du sous-sol, pas profondeur de sol ni analyse de terrain.',
  'Téléchargement départemental (GEO050K_HARM_0DD.zip). Couche surfacique S_FGEOL '
  '(formations géologiques) ; les couches L_* / P_* (failles, pendages) et '
  'S_SURCH (surcharges) ne sont pas ingérées. Champs : NOTATION (id '
  'stratigraphique, ex. j2c), DESCR (libellé complet avec l''étage), CARTE '
  '(feuille 1/50 000 d''origine).'
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- geology_units: one row per BD Charm-50 polygon, clipped to the vineyard.
--
-- Deliberately NOT the full départemental layer: the Haut-Rhin alone carries
-- 7 700 polygons, nearly all of them forest, plain and Vosges summits. The
-- ingestion clips to the dissolved INAO parcellaire buffered by 500 m, the
-- same mask already used for cadastre lieux-dits.
-- ---------------------------------------------------------------------------
create table if not exists geology_units (
  id                text primary key,
  department        text not null,
  -- BD Charm-50 identifiers.
  carte             text,          -- source 1/50 000 sheet
  code              text,
  code_leg          text,
  notation          text,          -- 'j2c', 't3C-D', 'h2vs(1)', 'OE'…
  descr             text not null, -- full label, incl. stratigraphic stage
  area_ha           numeric,       -- clipped area, not the source polygon's
  geom              geometry(MultiPolygon, 4326) not null,
  -- Provenance (never dropped — AGENTS.md §5).
  source_dataset_id text references source_datasets (id) on delete set null,
  source_type       source_type not null default 'real',
  ingested_at       timestamptz not null default now()
);

create index if not exists geology_units_geom_gix on geology_units using gist (geom);
create index if not exists geology_units_department_idx on geology_units (department);

-- ---------------------------------------------------------------------------
-- geology_at_point(lon, lat): the formation under one clicked point.
--
-- Ordered by clipped area so that when a point falls in more than one polygon
-- (shared boundaries, superimposed superficial deposits) the *smallest* and
-- therefore most specific unit wins, rather than an arbitrary one.
-- ---------------------------------------------------------------------------
create or replace function public.geology_at_point(
  lon double precision,
  lat double precision
)
returns table (
  id         text,
  department text,
  carte      text,
  notation   text,
  descr      text,
  area_ha    numeric
)
language sql
stable
parallel safe
as $$
  select g.id, g.department, g.carte, g.notation, g.descr, g.area_ha
  from geology_units g
  where ST_Intersects(g.geom, ST_SetSRID(ST_MakePoint(lon, lat), 4326))
  order by g.area_ha asc nulls last
  limit 1;
$$;

grant execute on function public.geology_at_point(double precision, double precision)
  to anon, authenticated, service_role;
