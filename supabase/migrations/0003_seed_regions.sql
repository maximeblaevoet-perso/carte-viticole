-- 0003_seed_regions.sql
-- Seed the three V1 regions (metadata + rough footprints).
-- These geometries are simplified editorial footprints, NOT official AOC limits.
-- Weather/indicator data is NOT seeded here: in V1 it is synthetic and generated
-- in the frontend; real data arrives via the ingestion pipeline.

insert into wine_regions (id, name, macro_area, blurb, center, geom)
values
  (
    'bordeaux',
    'Bordeaux',
    'Sud-Ouest',
    'Climat oceanique tempere, influence par l''estuaire de la Gironde.',
    ST_SetSRID(ST_MakePoint(-0.578, 44.837), 4326),
    ST_Multi(ST_GeomFromText(
      'POLYGON((-1.05 44.55, -0.95 45.3, -0.35 45.45, 0.15 45.0, 0.05 44.5, -0.55 44.3, -1.05 44.55))',
      4326))
  ),
  (
    'bourgogne',
    'Bourgogne',
    'Centre-Est',
    'Climat semi-continental a tendance fraiche, sensible au gel de printemps.',
    ST_SetSRID(ST_MakePoint(4.84, 47.02), 4326),
    ST_Multi(ST_GeomFromText(
      'POLYGON((4.45 46.6, 4.55 47.55, 5.0 47.6, 5.25 47.0, 5.0 46.55, 4.6 46.5, 4.45 46.6))',
      4326))
  ),
  (
    'rhone',
    'Vallee du Rhone',
    'Sud-Est',
    'Forte influence mediterraneenne au sud, etes chauds et secs.',
    ST_SetSRID(ST_MakePoint(4.83, 44.5), 4326),
    ST_Multi(ST_GeomFromText(
      'POLYGON((4.55 43.9, 4.6 45.3, 5.0 45.35, 5.25 44.2, 5.1 43.85, 4.7 43.8, 4.55 43.9))',
      4326))
  )
on conflict (id) do update
  set name = excluded.name,
      macro_area = excluded.macro_area,
      blurb = excluded.blurb,
      center = excluded.center,
      geom = excluded.geom;
