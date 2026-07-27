# 0006 — Stockage PostGIS hybride pour géodonnées viticoles

## Statut

Accepté.

## Contexte

La V1 affiche des contours éditoriaux seed dans `src/data/geo.ts` et une
hiérarchie `WineArea` en mémoire (`src/data/areas.ts`). Pour remplacer
progressivement ces géométries provisoires par des données sourcées (AOC/AOP/IGP,
crus, climats, parcellaire fin), il faut un modèle Supabase/PostGIS extensible
sans exploser le volume ni mélanger parcelles cadastrales et navigation
hiérarchique.

Scope initial : **Alsace** (51 Grands Crus comme aires fines) et **Champagne**
(Grands/Premiers Crus = communes ; parcelles → lieux-dits/cadastre). Structure
préparée pour **Bourgogne** (climats / 1ers crus) sans import massif immédiat.

Sources publiques cibles : SIQO INAO, aires AOC/AOP/IGP, parcellaire INAO
(informatif), RPG IGN (enrichissement vigne déclarée), cadastre Etalab
(lieux-dits). Aucune donnée inventée ; provenance obligatoire.

## Décision

Modèle **hybride** (migration `0005_wine_geodata.sql`) :

| Table | Rôle |
| ----- | ---- |
| `source_datasets` | Catalogue provenance (URL, licence, disclaimer, date) |
| `wine_areas` | Hiérarchie : régions, appellations, communes crus, grands crus, premiers crus, climats |
| `wine_parcels` | Parcelles fines (affichage zoom élevé uniquement) |
| `wine_area_parcels` | Lien many-to-many aire ↔ parcelle |
| `wine_lieux_dits` | Lieux-dits cadastraux (surtout Champagne) |

Chaque entité géographique porte : `source_dataset_id`, `source_type`,
`is_official`, `is_informative`, `source_updated_at`, `license`, `attribution`
(le cas échéant). Index **GIST** sur toutes les géométries.

Le frontend conserve le fallback seed (`src/data/areas.ts` + `geo.ts`) tant que
Supabase n'est pas alimenté. Une couche d'accès (`src/data/wine-geodata.ts`)
interroge PostGIS quand `NEXT_PUBLIC_DATA_SOURCE=real`, sinon retourne le seed.

Les contours seed restent `source_type = synthetic` ; les imports futurs
utiliseront `real` avec les datasets catalogués.

## Conséquences

- Pas d'import lourd dans cette migration : schéma + métadonnées `source_datasets`
  uniquement.
- Le climat macro reste sur `wine_regions` / `root_region_id` (inchangé).
- La carte pourra charger `wine_parcels` à la demande (bbox + zoom) sans
  alourdir `wine_areas`.
- Bourgogne : colonnes `region_type`, niveaux 3–4 et lien `wine_area_parcels`
  prêts ; import différé.
- Inspiration méthodologique : [open-wine-map](https://github.com/devloed-com/open-wine-map/)
  pour les pipelines d'ingestion à venir (scripts Python, hors scope V1).

## Alternatives écartées

- **Tout en `wine_areas` niveau 5** : volume parcellaire trop élevé, requêtes carte
  lentes.
- **GeoJSON fichiers seuls** : pas de requêtes spatiales, pas de provenance unifiée.
- **Import Bourgogne complet maintenant** : hors scope ; structure d'abord.
