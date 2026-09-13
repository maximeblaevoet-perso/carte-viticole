-- 0011_drop_non_wine_siqo_areas.sql
-- Remove non-viticultural SIQO areas ingested by mistake (ADR 0012).
--
-- `inao-aires-geo` is a catalogue of EVERY protected product, not a wine
-- dataset. The Alsace scope filter matched on the word "alsace", so it pulled
-- in Choucroute d'Alsace, Miel d'Alsace, Volailles d'Alsace, Pâtes d'Alsace,
-- the fruit eaux-de-vie (Kirsch, Quetsch, Mirabelle, Framboise), Marc d'Alsace
-- and Whisky d'Alsace. They are not wine areas and have no place in the
-- hierarchy — dropped here, and excluded at the source by `product_is_wine`
-- in `scripts/ingest_wine_geodata.py` (categorie must start with "Vin").

delete from public.wine_area_parcels
where wine_area_id in (
  'alsace-choucroute-d-alsace',
  'alsace-creme-fraiche-fluide-d-alsace',
  'alsace-framboise-d-alsace',
  'alsace-kirsch-d-alsace',
  'alsace-marc-d-alsace',
  'alsace-miel-d-alsace',
  'alsace-mirabelle-d-alsace',
  'alsace-pates-d-alsace',
  'alsace-quetsch-d-alsace',
  'alsace-volailles-d-alsace',
  'alsace-whisky-d-alsace-ou-whisky-alsacien'
);

update public.wine_lieux_dits
set wine_area_id = null
where wine_area_id in (
  'alsace-choucroute-d-alsace',
  'alsace-creme-fraiche-fluide-d-alsace',
  'alsace-framboise-d-alsace',
  'alsace-kirsch-d-alsace',
  'alsace-marc-d-alsace',
  'alsace-miel-d-alsace',
  'alsace-mirabelle-d-alsace',
  'alsace-pates-d-alsace',
  'alsace-quetsch-d-alsace',
  'alsace-volailles-d-alsace',
  'alsace-whisky-d-alsace-ou-whisky-alsacien'
);

delete from public.wine_areas
where id in (
  'alsace-choucroute-d-alsace',
  'alsace-creme-fraiche-fluide-d-alsace',
  'alsace-framboise-d-alsace',
  'alsace-kirsch-d-alsace',
  'alsace-marc-d-alsace',
  'alsace-miel-d-alsace',
  'alsace-mirabelle-d-alsace',
  'alsace-pates-d-alsace',
  'alsace-quetsch-d-alsace',
  'alsace-volailles-d-alsace',
  'alsace-whisky-d-alsace-ou-whisky-alsacien'
);
