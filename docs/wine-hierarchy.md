# Hiérarchie des aires viticoles

Ce document explique le modèle hiérarchique de la carte (région → sous-région →
village → cru → parcelle) : comment il est structuré, comment ajouter un niveau,
et où brancher ensuite les données sols / météo / climat / parcellaire.

## 1. Principes

- **Hiérarchie NON uniforme.** Chaque branche ne descend que jusqu'au niveau pour
  lequel on a des divisions et/ou des données utiles. Exemple : l'Alsace s'arrête
  pour l'instant à `Alsace Grand Cru`, la Bourgogne descend jusqu'au 1er Cru.
- **Contours séparés des données métier.** La géométrie vit dans
  `src/data/geo.ts` (clé `geoJsonId`) ; la hiérarchie/metadata vit dans
  `src/data/areas.ts` ; les données (climat/sols/scores) restent dans
  `synthetic.ts` / `soils.ts` / `scores.ts`.
- **Climat = macro pour l'instant.** Une sous-aire hérite du climat de sa région
  de niveau 1 via `rootRegionId`. On ne fabrique pas de climat fin.
- **Fallback propre.** Si une donnée n'existe pas à un niveau, on remonte l'arbre
  (sols) ou on affiche « donnée indisponible ». On n'invente jamais de valeurs.
- **Seed = provisoire.** Tout nœud sous le niveau 1 est marqué `provisional` et
  ses géométries sont des **footprints éditoriaux**, pas des limites AOC.

## 2. Le modèle `WineArea`

Défini dans `src/lib/types.ts` :

| champ                 | rôle                                                            |
| --------------------- | --------------------------------------------------------------- |
| `id`                  | slug unique tous niveaux confondus (ex. `meursault`)            |
| `name`                | libellé affiché                                                 |
| `level`               | 1 région · 2 sous-région/zone · 3 village/appellation · 4 cru · 5 parcelle |
| `parentId`            | parent direct (null au niveau 1)                                |
| `rootRegionId`        | région de niveau 1 (héritage du climat macro)                  |
| `regionType`          | classification éditoriale (`village`, `grand-cru`, …)          |
| `geoJsonId`           | clé de géométrie dans `geo.ts` (ou `null` si pas de contour)    |
| `center`              | `[lon, lat]` (centrage, label, marqueur point)                 |
| `zoomMin` / `zoomMax` | bande de zoom où l'aire est pertinente                          |
| `availableDataScopes` | scopes pour lesquels le nœud a ses **propres** données          |
| `provisional`         | marque les nœuds seed/non validés                              |

Le niveau 1 est dérivé automatiquement de `REGION_BASELINES` (source unique).

## 3. Affichage progressif au zoom

`LEVEL_ZOOM` (dans `areas.ts`) définit la bande de zoom par niveau. La carte
(`WineMap.tsx`) crée une couche par niveau avec `minzoom`/`maxzoom` :

- zoom faible → niveau 1 (grandes régions)
- zoom intermédiaire → niveau 2 (sous-régions)
- zoom fort → niveaux 3/4 (villages, crus) si disponibles

Cliquer une aire recentre et zoome (`SELECT_ZOOM`) pour révéler ses enfants.

## 4. Ajouter…

### …une région (niveau 1)
Ajouter une entrée dans `REGION_BASELINES` (`src/data/regions.ts`) et son
footprint dans `REGIONS_GEOJSON`. Elle apparaît automatiquement comme `WineArea`
de niveau 1 (climat synthétique généré, sols/scores à compléter).

### …une sous-région / village / cru
1. Ajouter un `area({ … })` dans le bon bloc de `src/data/areas.ts`
   (`level`, `parentId`, `rootRegionId`, `regionType`).
2. Optionnel : ajouter son contour dans `SUBAREA_GEOMETRIES` (`src/data/geo.ts`)
   sous la même clé que `geoJsonId`. Sans contour, mettre `geoJsonId: null` :
   l'aire s'affiche en **point** cliquable.

### …une parcelle (niveau 5)
Même principe : `level: 5`, `parentId` = le cru/lieu-dit, `geoJsonId` = sa
géométrie fine quand elle existe (sinon `null`). Aucun refactor nécessaire : la
carte et le panneau gèrent déjà n'importe quel niveau.

## Comment ajouter une nouvelle géométrie
- Créer ou mettre à jour l'entrée correspondante dans `src/data/geo.ts`.
- Utiliser `mpoly(...)` avec des coordonnées `[lon, lat]`.
- Fermer chaque anneau polygonal en répétant le premier point à la fin.
- Pour une sous-aire, relier la géométrie via `geoJsonId` dans `src/data/areas.ts`.
- Garder le contour éditorial et provisoire s'il n'est pas officiel.

## 5. Où brancher les données plus tard

- **Sols fins** : `AREA_SOILS` dans `src/data/soils.ts` (clé = `id` de l'aire).
  `getSoilsForArea()` prend ses propres sols, sinon remonte au parent/région,
  sinon « donnée indisponible ». Mettre `availableDataScopes: ["soils"]`.
- **Météo / climat fin** : aujourd'hui macro (hérité de `rootRegionId`). Pour
  descendre, ajouter des séries par aire (clé = `id`) et résoudre comme les sols
  (propre → parent → région). Conserver `source_type` + `confidence`.
- **Scores** : `scores.ts` (générique, aucune source protégée).
- **Parcellaire** : géométries fines dans `geo.ts` (ou fichiers
  GeoJSON/TopoJSON par niveau chargés à la demande) + nœuds `level: 5`.

## 6. Limites actuelles (assumées)

- Contours sous niveau 1 = **éditoriaux/approximatifs** (pas AOC officielles).
- Climat affiché toujours au niveau régional pour les sous-aires.
- La page détail (`/regions/[region]/vintage/[year]`) reste au niveau région ;
  le lien « Voir le détail » pointe vers la région racine.
- Données seed marquées `provisional` / `synthetic` — à remplacer par du sourcé.
