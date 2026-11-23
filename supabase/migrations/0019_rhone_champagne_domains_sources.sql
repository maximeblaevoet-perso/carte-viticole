-- 0019 — Rhône méridional and Champagne planted vines (ADR 0024): domain
-- provenance rows + index on vine_plots.wine_area_id.
--
-- No schema change: vine_plots, wine_areas and wine_domains already carry
-- every field. Only the provenance rows of the two manual domain lists, which
-- wine_domains.source_dataset_id references.

insert into source_datasets (id, name, provider, source_url, license, attribution, disclaimer, update_notes)
values
  (
    'manual-rhone-domains',
    'Domaines de référence du Rhône méridional (compilation)',
    'Compilation manuelle (sites des domaines, guides, presse)',
    null,
    null,
    'Voir les sources de chaque domaine',
    'Surfaces, crus et Villages déclarés publiquement, non vérifiés sur le terrain. Le score d''un domaine est composé de ses lieux déclarés et de la moyenne de ses communes : une estimation, jamais un relevé du casier viticole.',
    'scripts/data/rhone-domains.json'
  ),
  (
    'manual-champagne-domains',
    'Producteurs de référence de Champagne (compilation)',
    'Compilation manuelle (sites des producteurs, guides, presse)',
    null,
    null,
    'Voir les sources de chaque producteur',
    'Surfaces, crus (communes) et lieux-dits déclarés publiquement, non vérifiés sur le terrain. Le score d''un producteur est composé de ses crus et lieux déclarés et de la moyenne de ses communes : une estimation, jamais un relevé du casier viticole.',
    'scripts/data/champagne-domains.json'
  )
on conflict (id) do nothing;

-- vine_plots.wine_area_id references wine_areas (on delete set null) without
-- an index: deleting one area scanned every vine plot, and replacing the areas
-- of a region hit the PostgREST statement timeout (mode op B9).
create index if not exists vine_plots_wine_area_idx on vine_plots (wine_area_id);
