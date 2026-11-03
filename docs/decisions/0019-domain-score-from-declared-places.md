# ADR 0019 — Score des domaines composé de leurs lieux déclarés, sans attribution de parcelles

## Status

Accepted — 2026-11-03. Remplace la partie « attribution des parcelles » de
l'ADR 0016.

## Context

L'ADR 0016 attribuait des parcelles à chaque domaine de référence : d'abord ses
grands crus déclarés (coût réduit, plafonnés), puis les vignes libres **les plus
proches du chai** jusqu'à 80 % de la surface déclarée. Deux défauts sont apparus
à l'usage :

- **Biais du village.** 57 chais sur 60 sont placés au centre du village. Or en
  Alsace le village est au pied du coteau, côté plaine : « le plus proche »
  veut presque toujours dire « la plaine ». Frey-Sohler (Scherwiller) recevait
  20 ha de vignes de plaine dans un rayon de 565 m (score 42,8), alors que 70 ha
  de coteaux à plus de 70 restaient sans domaine, dont le Rittersberg qu'il
  déclare. Score 49,7.
- **Lieux arbitraires.** À l'intérieur d'un cru, les parcelles retenues étaient
  les plus proches du chai : le Rangen de Zind-Humbrecht tombait côté
  Vieux-Thann (extrémité est), alors que le domaine y déclare le Clos
  Saint-Urbain, côté Thann. Les lieux-dits déclarés étaient ignorés.

Par ailleurs, contourner des dizaines de parcelles « estimées » chargeait la
carte et laissait croire à un relevé.

## Decision

1. **Plus aucune parcelle n'est attribuée à un domaine.** `vine_plots` perd
   `domain_id`, `domain_distance_m` et `domain_via_cru`. Le mode de couleur
   « Domaine estimé » disparaît (migration 0015).
2. **Score composé** de ce que le domaine déclare
   (`terroir_score.compose_domain`) :
   - chaque **grand cru** et **lieu-dit** déclaré compte pour sa surface
     déclarée (`surfaces_ha`), plafonnée par les vignes plantées du lieu ; à
     défaut, pour min(25 % des vignes du lieu ; 12 % de la surface du
     domaine) ;
   - un total déclaré en grands crus (`surface_grands_crus_ha`, ex.
     Schlumberger « ~70 ha ») est réparti à parts égales entre les crus sans
     surface propre ;
   - le **reste** de la surface prend la moyenne, pondérée par la surface, des
     vignes **hors grand cru** des communes du domaine (`communes` déclarées,
     sinon la commune du chai). C'est une espérance, pas une sélection ;
   - si les lieux déclarés dépassent la surface, ils sont réduits
     proportionnellement.
3. **Lieux-dits rattachés au cadastre par une table explicite**
   (`lieux_dits_cadastre` : nom d'usage → commune + noms cadastraux). Le nom
   d'usage (« Clos Windsbuhl ») diffère souvent du cadastre (`WINDSBUEHL`) et
   un même nom existe dans plusieurs communes : pas de rapprochement
   automatique. Un lieu sans correspondance reste « non localisé »
   (`unresolved_places`) et compte dans le reste.
4. **Un lieu-dit situé surtout dans un cru déclaré épingle ce cru** : le Rangen
   de Zind-Humbrecht est noté sur le lieu-dit `RANGEN` de Thann (Clos
   Saint-Urbain), pas sur tout le cru.
5. **Affichage léger.** Un clic sur un chai dessine en pointillé rose les
   seuls lieux déclarés (crus et lieux-dits), avec leur nom et « ≈ n ha ». Un
   lieu hors du cadre devient une étiquette en haut à gauche (« Rangen ·
   33 km ↓ ») qui y mène. Les communes du reste ne sont pas dessinées : le
   panneau montre la composition (barre et liste). La fiche d'une vigne liste
   les domaines qui **déclarent** son cru ou son lieu-dit, sans dire qu'elle
   leur appartient.
6. **Confiance** (`score_confidence`) : part de la surface reposant sur des
   surfaces déclarées (≥ 50 % : 2 points, ≥ 15 % : 1), communes déclarées
   (1), fiche bien sourcée (haute 2, moyenne 1). Haute ≥ 4, moyenne ≥ 2.

Les surfaces par lieu et les communes ajoutées à `alsace-domains.json` sont
tirées des notes déjà sourcées de chaque domaine ; une fourchette est prise en
son milieu. Rien n'est inventé : sans chiffre, la valeur par défaut s'applique
et la fiche le dit.

## Consequences

- Zind-Humbrecht : 80,5 → 74,8 (Rangen côté Thann, Brand, Hengst, Goldert,
  Windsbuehl, Herrenweg de plaine, reste à la moyenne des cinq communes).
  Frey-Sohler : 49,7 → 59,7. Le Herrenweg déclaré tire honnêtement la note
  vers le bas.
- Le score d'un domaine ne dépend plus de l'ordre de service entre domaines
  voisins ni de la position exacte du chai.
- Les valeurs par défaut (25 % / 12 %) pèsent lourd quand un domaine ne publie
  pas ses surfaces : compléter `surfaces_ha` améliore directement la note et
  la confiance.
- `wine_domains.composition` porte les contours simplifiés des lieux (GeoJSON
  à 10 m) : la liste des domaines pèse quelques centaines de Ko.
- `build_alsace_vineyard.py --domains-only [--commit]` recalcule les domaines
  depuis le cache des vignes, sans réécrire `vine_plots`.

## Alternatives rejetées

- **Garder l'attribution en partant de l'adresse exacte du chai** : réduit le
  biais sans le supprimer (une cave de village reste en bas du coteau) et
  continue de désigner des parcelles qu'on ne connaît pas.
- **Rapprochement automatique des lieux-dits par nom** : « Herrenweg » existe
  dans huit communes, « Kritt » dans cinq ; une table explicite est plus sûre
  et relisible.
- **Noter le reste sur le secteur de 1,5 km autour du chai** : reproduit le
  biais du village ; le score secteur reste affiché à titre de comparaison.
