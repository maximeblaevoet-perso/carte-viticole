# 0004 — Modèle hiérarchique des aires viticoles

## Statut

Accepté.

## Contexte

La V1 traitait les régions comme une liste plate (`WineRegion`). Le produit doit
permettre une navigation hiérarchique (région → sous-région → village → cru →
parcelle) avec un niveau de détail **variable selon la région**, et descendre
plus finement pour certaines données (sols au niveau village/Grand Cru) tout en
gardant d'autres données au niveau macro (météo/climat régional pour l'instant).

## Décision

Introduction d'un modèle hiérarchique additif `WineArea`
(`id, name, level, parentId, rootRegionId, regionType, geoJsonId, center,
zoomMin, zoomMax, availableDataScopes`) :

- **Séparation contours / métier** : géométries dans `src/data/geo.ts` (clé
  `geoJsonId`), hiérarchie/metadata dans `src/data/areas.ts`, données métier
  inchangées (`synthetic.ts`, `soils.ts`, `scores.ts`).
- **Niveau 1 dérivé** des `REGION_BASELINES` existants → ids inchangés, le climat
  synthétique, les sols et scores existants continuent de fonctionner.
- **Climat macro hérité** via `rootRegionId` ; les sols peuvent descendre avec un
  fallback (`getSoilsForArea`) ; absence de donnée → « donnée indisponible ».
- **Carte** : une couche MapLibre par niveau, révélée progressivement au zoom
  (`LEVEL_ZOOM`), hover/popup, sélection + recentrage.
- **Seed provisoire** pour Alsace, Bourgogne, Bordeaux, Rhône, Loire ; les autres
  régions restent niveau 1 (hiérarchie volontairement non uniforme).

Le Rhône septentrional/méridional est modélisé en niveau 2 (et non niveau 1)
pour préserver la clé de climat régional `rhone` ; promotion possible plus tard.

## Conséquences

- Extensible jusqu'au parcellaire (niveau 5) sans refactor du composant carte ni
  du panneau (qui gèrent un niveau quelconque).
- Les contours sous niveau 1 sont éditoriaux/approximatifs (pas AOC officielles).
- La V1 reste sans base de données ; le mapping SQL pourra ajouter une table
  `wine_areas` (self-référencée par `parent_id`) miroir de `WineArea`.

## Alternatives écartées

- Hiérarchie uniforme imposée à toutes les régions : irréaliste et contraire au
  terrain viticole.
- Tout encoder dans le composant carte : non maintenable, non extensible.
