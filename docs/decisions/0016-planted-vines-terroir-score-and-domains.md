# ADR 0016 — Vignes réellement plantées, score terroir par parcelle et domaines estimés (Alsace)

## Status

Accepted — 2026-11-02

## Context

À fort zoom, le « parcellaire » Alsace affichait deux couches qui ne sont pas
des vignes :

- `wine_parcels` = le **parcellaire INAO**, c'est-à-dire une *aire délimitée*
  par commune × dénomination (ADR 0012). Elle contient forêts, vergers,
  friches et maisons ;
- `wine_lieux_dits` = les lieux-dits cadastraux qui *touchent* l'aire AOC : un
  lieu-dit de coteau déborde largement sur la forêt.

Résultat : l'utilisateur voyait des « parcelles » en pleine forêt, et aucune
information de terrain (pente, exposition) à la parcelle.

Le projet frère Domaine_Taillades (carte du Luberon) résout ce problème : il
affiche seulement les vignes plantées (RPG + BD TOPO), les enrichit
(géologie 1/50 000, relief, sol) et les note avec un score de potentiel
réglable. Il compare aussi des domaines de référence, mais en lisant un simple
rayon de 1,5 km autour de chacun.

## Decision

### 1. Les vignes plantées remplacent l'aire INAO à fort zoom

`scripts/build_alsace_vineyard.py` construit la table `vine_plots`
(migration 0013) :

1. **RPG** (déclarations PAC, groupe de cultures 21 « Vignes »), via le WFS
   Géoplateforme ;
2. **BD TOPO** `zone_de_vegetation` nature « Vigne », seulement là où le RPG
   n'a rien (différence géométrique indexée), polygones > 0,15 ha ;
3. gardées seulement dans l'aire AOC Alsace (parcellaire INAO 67/68, + 20 m) ;
4. enrichies : commune, appellation la plus fine (grand cru > dénomination
   complémentaire > Alsace), lieu-dit cadastral au centre, formation BD
   Charm-50 dominante (surface), altitude / pente / exposition (RGE ALTI,
   centre ± 30 m), sol dominant RRP 1/250 000.

L'aire INAO reste un *attribut* de la vigne, plus une forme affichée. Les
lieux-dits alsaciens ne sont plus remplis (contour + nom seulement) : la
couleur est portée par les vignes.

### 2. Score terroir par parcelle (grille partagée)

Repris de Taillades (géologie, exposition, pente, altitude, sol ; moyenne
pondérée de composantes dans [0, 1]) et **recalé pour l'Alsace** :
l'exposition au soleil pèse plus (25 contre 20), l'altitude favorise le
coteau 250–450 m plutôt que la plaine à 180 m, et les familles de roche
couvrent granite, schiste, grès, volcanique. Deux lectures de l'exposition :
`soleil` (par défaut, lecture classique en climat septentrional) et
`fraicheur` (versants nord favorisés, lecture « changement climatique »).

La grille est **un seul fichier**, `src/data/terroir-score-alsace.json`, lu
par Python (calcul) et par TypeScript (affichage, re-pondération). Les
composantes sont stockées par parcelle (`score_components`), pour qu'une
pondération différente ne demande pas de recalcul géographique. La
classification des roches est le jumeau Python de `src/lib/geology-formation.ts`.

### 3. Domaines : liste manuelle sourcée + attribution par surface

`scripts/data/alsace-domains.json` : 60 domaines (`source_type = manual`),
avec commune du chai, surface déclarée, grands crus exploités, sources et
niveau de confiance. Pas de coopératives ni de négoce pur.

L'attribution va plus loin que « le plus proche » (`terroir_score.assign_domains`) :

- **cible** = 80 % de la surface déclarée ;
- **file globale** de candidats (domaine, parcelle) triés par coût
  = distance au chai / rayon du domaine : un domaine de 130 ha et un de 6 ha
  du même village se disputent les vignes à armes égales ;
- **rayon** = 2,5 km × √(surface / 10 ha), borné à [2 ; 8] km : on
  n'extrapole pas au-delà, et un domaine dont l'entourage est déjà pris
  finit sous la cible — sa **couverture** le dit ;
- **grands crus déclarés** réclamés d'abord (jusqu'à 40 km : un domaine de
  Turckheim exploite bien le Rangen de Thann), mais **plafonnés** à
  min(25 % des vignes du cru ; 12 % de la surface du domaine), car des
  dizaines de vignerons se partagent un cru ;
- une parcelle n'appartient qu'à un domaine.

Score du domaine = moyenne des scores de ses parcelles, pondérée par la
surface ; on publie aussi le score du **secteur** (toutes les vignes à 1,5 km,
comme Taillades) qui ne dépend pas de l'attribution. Une **confiance**
(haute / moyenne / basse) combine couverture, précision des coordonnées et
fiabilité de la surface.

### 4. Allègement de la base

`prune_alsace_vineless_geodata()` (appelée par `--commit --prune`) supprime les
lignes `wine_parcels` INAO d'Alsace (aires, plus utiles à l'écran ; les
contours de grands crus déjà dissous dans `wine_areas` ne bougent pas) et les
lieux-dits alsaciens sans aucune vigne. Elle refuse de tourner tant que
`vine_plots` est vide, et n'est exécutable que par `service_role`.

## Consequences

- À partir du zoom 13, la carte d'Alsace montre ~45 000 vignes colorées par
  score (ou géologie, pente, exposition, altitude, domaine estimé), et plus
  aucune « parcelle » en forêt.
- Un clic sur une vigne donne sa fiche (terrain, score détaillé, domaine
  estimé) ; un clic sur un chai donne la fiche du domaine et entoure ses
  parcelles estimées ; la région Alsace liste les domaines classés.
- Les parcelles d'un domaine sont une **estimation géographique**, jamais le
  casier viticole (confidentiel). Le texte le répète partout où elles
  apparaissent.
- `vine_plots` pèse ~quelques dizaines de Mo ; la suppression des aires INAO
  et des lieux-dits sans vigne compense en partie. L'espace disque n'est rendu
  qu'après un `VACUUM FULL` (tableau de bord Supabase).
- Une ré-ingestion `ingest_wine_geodata.py --commit` réinsérerait les aires et
  lieux-dits supprimés : relancer ensuite `build_alsace_vineyard.py --commit --prune`.
- Le RPG anonymise l'exploitant : on ne sait pas *qui* déclare une parcelle,
  d'où l'estimation.
- Coordonnées des chais : 57 domaines sur 60 sont au centre du village.

## Alternatives considered

- **Garder l'aire INAO et la colorer** — rejeté : elle n'est pas le vignoble.
- **Découper les lieux-dits sur les vignes** — rejeté : le lieu-dit cesserait
  d'être le lieu-dit cadastral, et une ré-ingestion le reconstruirait entier.
  Contour + nom suffisent.
- **Score calculé seulement côté client** (comme Taillades, en HTML statique) —
  rejeté : le score des domaines dépend de dizaines de milliers de parcelles
  qui ne sont jamais toutes chargées dans le navigateur.
- **Domaines issus de SIRENE (NAF 01.21Z)** — rejeté : exhaustif mais sans
  surface, avec beaucoup d'entreprises individuelles (données personnelles), et
  sans grands crus.
- **Attribution « au plus proche »** — rejeté : un grand domaine prenait tout
  son village, un petit se retrouvait avec des parcelles à 10 km.
