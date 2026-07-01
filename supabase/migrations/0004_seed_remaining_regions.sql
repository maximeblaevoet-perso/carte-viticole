-- 0004_seed_remaining_regions.sql
-- Seed the nine V1 regions added to 0003 *after* it had already been applied
-- to the remote database. Because migration versions run once, the expanded
-- 0003 was never replayed, leaving wine_regions with only the first three
-- regions and breaking the region_weather_stations foreign key on ingestion.
-- This migration is an idempotent upsert (safe to re-run).
-- Geometries are simplified editorial footprints, NOT official AOC limits.

insert into wine_regions (id, name, macro_area, blurb, center, geom)
values
  (
    'alsace',
    'Alsace',
    'Nord-Est',
    'Climat semi-continental sec, abrite par les Vosges. Etes chauds et ensoleilles, pluies plus faibles que la moyenne.',
    ST_SetSRID(ST_MakePoint(7.35, 48.25), 4326),
    ST_Multi(ST_GeomFromText(
      'POLYGON((7.0 48.4, 7.1 49.0, 7.55 49.1, 7.85 48.5, 7.6 48.1, 7.15 48.0, 7.0 48.4))',
      4326))
  ),
  (
    'champagne',
    'Champagne',
    'Nord-Est',
    'Climat frais a tendance continentale, avec risques de gel au printemps et pluies bien reparties.',
    ST_SetSRID(ST_MakePoint(4.05, 49.05), 4326),
    ST_Multi(ST_GeomFromText(
      'POLYGON((3.4 48.7, 3.6 49.5, 4.5 49.6, 4.8 48.9, 4.5 48.4, 3.8 48.35, 3.4 48.7))',
      4326))
  ),
  (
    'loire',
    'Loire',
    'Ouest / Centre',
    'Climat oceanique tempere, plus continental vers l''est. Pluies reparties et printemps sensibles au gel.',
    ST_SetSRID(ST_MakePoint(0.6, 47.3), 4326),
    ST_Multi(ST_GeomFromText(
      'POLYGON((-1.0 46.3, -0.6 47.8, 0.4 48.1, 1.4 47.8, 1.7 46.8, 0.8 46.1, -0.2 46.0, -1.0 46.3))',
      4326))
  ),
  (
    'corse',
    'Corse',
    'Mediterranee',
    'Climat mediterraneen maritime, tres ensoleille et ventile. Etes secs, forte amplitude locale entre cote et montagne.',
    ST_SetSRID(ST_MakePoint(9.15, 42.18), 4326),
    ST_Multi(ST_GeomFromText(
      'POLYGON((8.7 41.8, 8.95 42.8, 9.55 42.9, 9.95 42.15, 9.6 41.3, 8.95 41.2, 8.7 41.8))',
      4326))
  ),
  (
    'provence',
    'Provence',
    'Sud-Est',
    'Climat mediterraneen chaud et tres sec l''ete, avec mistral et pluies d''automne marquees.',
    ST_SetSRID(ST_MakePoint(5.35, 43.55), 4326),
    ST_Multi(ST_GeomFromText(
      'POLYGON((4.4 42.9, 4.6 44.2, 6.0 44.25, 6.35 43.25, 5.7 42.8, 4.9 42.75, 4.4 42.9))',
      4326))
  ),
  (
    'beaujolais',
    'Beaujolais',
    'Centre-Est',
    'Climat de transition entre Bourgogne et Rhone, avec influences continentales et episodes chauds d''ete.',
    ST_SetSRID(ST_MakePoint(4.67, 46.15), 4326),
    ST_Multi(ST_GeomFromText(
      'POLYGON((4.35 45.7, 4.35 46.5, 4.95 46.55, 5.15 45.95, 4.8 45.6, 4.35 45.7))',
      4326))
  ),
  (
    'jura',
    'Jura',
    'Est',
    'Climat frais et plus continental, avec fort risque de gel de printemps et pluies bien reparties.',
    ST_SetSRID(ST_MakePoint(5.78, 46.82), 4326),
    ST_Multi(ST_GeomFromText(
      'POLYGON((5.45 46.35, 5.45 47.25, 6.15 47.35, 6.4 46.75, 6.0 46.3, 5.45 46.35))',
      4326))
  ),
  (
    'savoie',
    'Savoie',
    'Alpes',
    'Climat alpin a influence montagnarde, frais et humide, avec fortes differences selon l''altitude.',
    ST_SetSRID(ST_MakePoint(6.32, 45.55), 4326),
    ST_Multi(ST_GeomFromText(
      'POLYGON((5.7 45.0, 5.75 45.95, 6.55 46.05, 6.85 45.45, 6.35 44.95, 5.7 45.0))',
      4326))
  ),
  (
    'languedoc-roussillon',
    'Languedoc-Roussillon',
    'Mediterranee',
    'Climat mediterraneen chaud et sec, avec forte luminosite et episodes pluvieux parfois intenses a l''automne.',
    ST_SetSRID(ST_MakePoint(3.45, 43.45), 4326),
    ST_Multi(ST_GeomFromText(
      'POLYGON((2.8 42.4, 3.0 43.9, 4.5 44.1, 4.95 43.1, 4.25 42.3, 3.2 42.2, 2.8 42.4))',
      4326))
  )
on conflict (id) do update
  set name = excluded.name,
      macro_area = excluded.macro_area,
      blurb = excluded.blurb,
      center = excluded.center,
      geom = excluded.geom;
