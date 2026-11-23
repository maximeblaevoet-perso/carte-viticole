# ADR 0024 — Vignes plantées : Rhône méridional et Champagne

Date : 2026-11-23 · Statut : accepté

## Contexte

La chaîne « vignes plantées » (ADR 0016 à 0021) existe pour l'Alsace et la
Bourgogne. On l'étend au Rhône méridional (Châteauneuf, Dentelles, Ventoux,
Luberon, Alpilles, Costières…) et à la Champagne. Deux difficultés :

- le Rhône n'a ni grand ni premier cru : sa pyramide est celle d'Inter-Rhône
  (crus > Côtes du Rhône Villages avec nom géographique > Villages > Côtes du
  Rhône et AOC « satellites ») ;
- la Champagne est **absente** du parcellaire INAO. Aucune délimitation
  vectorielle de l'aire parcellaire n'est publiée (INAO, data.gouv, Comité
  Champagne) : le cahier des charges renvoie à la loi du 6 mai 1919 et à des
  plans déposés en mairie. Les cartes du site du Comité Champagne sont des
  images ; les géoréférencer n'apporterait presque rien, l'aire étant presque
  entièrement plantée.

## Décision

1. **Rhône = région `rhone`** (Vallée du Rhône), limitée pour l'instant au sud :
   départements 84, 30, 26, 07, 13 (Les Baux-de-Provence, demandé pour les
   Alpilles), 04 (Pierrevert) ; Côtes du Rhône au nord de 44,6° N, Diois et
   crus septentrionaux exclus. Le nord pourra s'ajouter comme d'autres secteurs.
2. **Pyramide du Rhône sur les quatre niveaux** de `cru_level` : crus →
   `grand_cru`, Villages nommés → `premier_cru`, Côtes du Rhône Villages →
   `village`, Côtes du Rhône et satellites → `regional`. Le front affiche
   « Cru », « Côtes du Rhône Villages + nom »… (`cruLevelLabel`,
   `areaTierLabel`) : jamais « grand cru » pour le Rhône. `grand_cru` reste vide.
3. **Secteurs Rhône** : Vaucluse rhodanien, Gard rhodanien, Drôme provençale,
   Ardèche méridionale (par département) ; Ventoux, Luberon, Costières de Nîmes,
   Alpilles, Pierrevert (par AOC satellite).
4. **Champagne : vignes RPG / BD TOPO dans les 319 crus** (communes de l'aire),
   classées par commune **historique** : grand cru (17) et premier cru (42)
   selon le cahier des charges homologué le 31 juillet 2025. Les anciennes
   communes fondues dans une commune nouvelle (Aÿ, Mareuil-sur-Aÿ et Bisseuil
   dans Aÿ-Champagne ; Oger, Vertus, Voipreux dans Blancs-Coteaux…) sont
   retrouvées par le **préfixe des sections cadastrales** Etalab.
   Référentiel : `scripts/data/champagne-crus.json`.
5. **Arbre Champagne** : 1 Champagne > 2 zone (4) > 3 terroir (17) > 4 cru
   (commune). Zones et terroirs : découpage de l'Union des Maisons de
   Champagne, non réglementaire, signalé comme tel. Il remplace les 37 aires
   communales de `ingest_wine_geodata.py --scope champagne` (liste de premiers
   crus fausse) et ses lieux-dits non découpés.
6. **Une grille par région** : `terroir-score-rhone.json` (terrasses de galets
   lues par l'âge de la terrasse, terrasse plate peu pénalisée) et
   `terroir-score-champagne.json` (craie campanienne, géologie à 40 %).
7. **Domaines** : `scripts/data/rhone-domains.json` (31) et
   `champagne-domains.json` (30), mêmes règles qu'ADR 0019 / 0021. En
   Champagne un premier cru déclaré est une commune (`premier_cru`). Quand les
   communes d'un domaine sont entièrement en cru (Châteauneuf, Avize), le
   « reste » prend la moyenne de toutes leurs vignes.

## Conséquences

- `build_vineyard.py` : `Region.areas` nomme le constructeur d'aires de la
  région (`build_areas_bourgogne`, `_rhone`, `_champagne`).
- Sans migration : `vine_plots` et `wine_areas` portent déjà tout ce qu'il faut.
- Le test de hiérarchie et ses exceptions sont dans
  `docs/mode-op-replication-region.md` (B1 à B8).
