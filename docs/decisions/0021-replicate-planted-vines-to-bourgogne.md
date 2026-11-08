# ADR 0021 — Répliquer la chaîne « vignes plantées » à la Bourgogne

Date : 2026-11-06 · Statut : accepté (calibrage de la grille en cours)

## Contexte

L'Alsace a une chaîne complète (ADR 0016 à 0020) : vignes réellement plantées
(RPG + BD TOPO) dans l'aire AOC, géologie BD Charm-50, relief RGE ALTI, sol
RRP, score terroir, lieux-dits découpés aux vignes, domaines de référence.
Elle est écrite pour un seul jeu de départements et une seule grille. On veut
la même structure en Bourgogne (Chablis, Côte de Nuits, Côte de Beaune, Côte
Chalonnaise, Mâconnais, Auxerrois, Châtillonnais), puis dans d'autres régions.

## Décision

1. **Un script, une configuration par région.** `scripts/build_alsace_vineyard.py`
   devient `scripts/build_vineyard.py --region <id>` ; l'ancien nom reste un
   alias. Ce qui diffère d'une région à l'autre (départements, emprise,
   règles de classement, construction des aires) est dans `REGIONS`.
2. **Niveau de cru par vigne** (`vine_plots.cru_level` : `grand_cru`,
   `premier_cru`, `village`, `regional`) = rang INAO le plus élevé parmi les
   aires qui contiennent le centre de la vigne, plus `premier_cru` (climat),
   `village` (appellation communale) et `secteur`. Migration 0016.
3. **Le classement n'entre pas dans le score.** Le score reste physique
   (géologie, exposition, pente, altitude, sol). Le classement sert de
   **contrôle** : médiane par niveau, par secteur, imprimée à chaque run
   (« test de hiérarchie »). Mettre le classement dans le score rendrait le
   contrôle circulaire et la carte n'apprendrait plus rien.
4. **Une grille par région** (`src/data/terroir-score-<region>.json`), avec
   deux extensions facultatives lues par `terroir_score.py` :
   `altitude_secteurs` (barème d'altitude par secteur, le niveau de base
   allant de 130 m à Chablis à 240 m en Côte d'Or) et `geologie_motifs`
   (regex sur le libellé BRGM qui priment sur la famille de roche, pour les
   étages qui font le terroir local). Sans ces clés, la grille alsacienne
   donne exactement les mêmes scores qu'avant.
5. **Aires Bourgogne construites depuis le parcellaire INAO** par le script :
   1 Bourgogne > 2 secteur (emprise des vignes) > 3 appellation village >
   4 premier cru / grand cru (> 5 climats de Corton). Régionales, parapluies
   « premier cru » et variantes de couleur restent dans l'arbre, masquées.
   Pas de `wine_parcels` en Bourgogne : la carte montre les vignes.
6. **Lieux-dits Bourgogne** : seuls les morceaux plantés du cadastre sont
   écrits (`lieu-dit ∩ vignes`, ADR 0017), jamais le cadastre entier.
7. **Domaines** : `scripts/data/bourgogne-domains.json`, mêmes règles que
   l'ADR 0019, avec en plus `premiers_crus` et `villages` (noms INAO exacts).
   Le reste d'un domaine prend la moyenne des vignes village et régionales de
   ses communes.
8. Méthode de réplication et anomalies rencontrées :
   `docs/mode-op-replication-region.md`.

## Conséquences

- Front : grille choisie par la région de la vigne ou du domaine
  (`gridFor`), popup et fiche affichent le niveau de cru, nouvelle coloration
  « Niveau de cru », domaines chargés pour l'Alsace et la Bourgogne.
- `wine_mvt` expose `root_region_id`, `cru_level`, `premier_cru`, `village`,
  `secteur` sur la couche des vignes.
- Le calibrage de la grille Bourgogne est itératif : chaque changement de
  barème doit être justifié par la géographie et noté dans le mode op.
