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
- **Stockage cible PostGIS (ADR 0006).** Hiérarchie dans `wine_areas` ; parcelles
  fines dans `wine_parcels` (zoom ≥ 14) ; liens `wine_area_parcels` ; lieux-dits
  Champagne dans `wine_lieux_dits`. Provenance via `source_datasets`.

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
| `provenance`          | provenance PostGIS (`GeoDataProvenance`) quand chargé depuis Supabase |
| `inaoIdApp` / `inaoIdDenom` / `inseeCommune` | clés d'ingest INAO/INSEE |

Types complémentaires (`src/lib/types.ts`) : `WineParcel`, `WineLieuDit`,
`SourceDataset` — voir `docs/data-model.md`.

### Modèle hybride (parcelles)

Ne pas mettre chaque parcelle cadastrale dans `wine_areas` (explosion de volume).

| Couche | Table | Affichage |
| ------ | ----- | --------- |
| Navigation | `wine_areas` | zoom progressif (niveaux 1–4, parfois 5 lieu-dit) |
| Parcellaire fin | `wine_parcels` | zoom élevé uniquement (`zoom_min` ≈ 14) |
| Lien | `wine_area_parcels` | many-to-many cru/climat ↔ parcelle |
| Lieu-dit | `wine_lieux_dits` | étiquette cadastrale (surtout Champagne) |

**Champagne :** Grand Cru / Premier Cru = communes (`wine_areas`, `insee_commune`).
Les parcelles affichent le lieu-dit via `wine_lieux_dits`, pas un cru imbriqué.

**Alsace :** les 51 Grands Crus = nœuds `wine_areas` (`region_type = grand-cru`),
géométrie INAO quand importée.

**Bourgogne :** structure prête (climats / 1ers crus en `wine_areas` niveau 4) ;
import complet plus tard.

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
Deux chemins selon la granularité :
1. **Hiérarchique** (rare) : `level: 5` dans `areas.ts` seed ou `wine_areas` si
   le nœud a un rôle de navigation.
2. **Parcellaire fin (recommandé)** : ligne dans `wine_parcels` + lien
   `wine_area_parcels` vers le cru/climat parent. Affichage carte au zoom fort
   seulement. Données depuis INAO parcellaire ou cadastre — jamais inventées.

Accès données : `src/data/wine-geodata.ts` (`getParcelsForArea`,
`getLieuxDitsForArea`) avec fallback seed vide en mode synthétique.

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
- **Parcellaire** : `wine_parcels` + `wine_area_parcels` en PostGIS ; lieux-dits
  Champagne dans `wine_lieux_dits`. Seed provisoire : `geo.ts` niveau 5 si besoin.

## 6. Limites actuelles (assumées)

- Contours sous niveau 1 = **éditoriaux/approximatifs** (pas AOC officielles)
  jusqu'à import INAO ; données INAO parcellaire = `is_informative`.
- Climat affiché toujours au niveau régional pour les sous-aires.
- La page détail (`/regions/[region]/vintage/[year]`) reste au niveau région ;
  le lien « Voir le détail » pointe vers la région racine.
- Données seed marquées `provisional` / `synthetic` — à remplacer par du sourcé.
