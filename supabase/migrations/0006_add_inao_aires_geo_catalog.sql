-- 0006_add_inao_aires_geo_catalog.sql
-- Add missing source_datasets row referenced by ingest provenance (inao-aires-geo).

insert into source_datasets (id, name, provider, source_url, license, attribution, disclaimer, update_notes)
values
  (
    'inao-aires-geo',
    'Délimitation des aires géographiques des SIQO',
    'INAO / data.gouv.fr',
    'https://www.data.gouv.fr/datasets/delimitation-des-aires-geographiques-des-siqo',
    'Licence Ouverte / Etalab',
    'INAO — data.gouv.fr',
    'Contours informatifs ; limites officielles = plans INAO/mairie.',
    'Géométries d''aires d''appellation (shapefile national).'
  )
on conflict (id) do nothing;
