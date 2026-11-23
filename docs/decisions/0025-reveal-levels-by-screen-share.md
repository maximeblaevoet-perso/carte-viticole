# ADR 0025 — Niveaux de la carte révélés par part d'écran, non par zoom fixe

Date : 2026-11-23 · Statut : accepté (migration 0020 à appliquer)

## Contexte

L'ADR 0022 lisait la hiérarchie par **bandes de zoom globales** : secteurs
7–10,3, villages 9,6–12,8, crus ≥ 10,8, vignes ≥ 13, pour toute la France.
Retour utilisateur après l'ajout du Rhône et de la Champagne (ADR 0024) :

- en Alsace, une petite appellation communale (Val Saint Grégoire, ~10 km)
  restait affichée — lavis, contour, nom le long du bord — bien au-delà du
  moment où elle remplit l'écran ;
- même chose pour le Vaucluse rhodanien, secteur trois fois plus grand qu'un
  secteur de Bourgogne mais coupé au même zoom ;
- à Châteauneuf-du-Pape, les vignes n'arrivaient qu'au zoom 13 alors que
  l'appellation remplit déjà l'écran vers 11,7 : impossible de voir ses
  zones géologiques (sables, galets roulés, marnes…) d'un coup d'œil.

Un même zoom ne veut pas dire la même chose selon la taille des lieux.

## Décision

**Un lieu passe la main à ses enfants quand il remplit ~60 % du petit côté
de l'écran.** C'est la règle des cartes web : la visibilité d'un objet dépend
de sa taille projetée en pixels, pas d'un zoom fixe par type (OpenMapTiles
`way_pixels`, `minzoom` par surface de Tippecanoe, divulgation progressive
des grands fonds de carte).

1. **`reveal_zoom` par aire** (migration 0020, `map_reveal_zoom(geom)`) :
   zoom où l'emprise de l'aire couvre 60 % d'un petit côté de 1024 px,
   `log2(0,6 × 1024 / (512 × max(dx, dy) / C))` en Web Mercator.
   Exemples : Châteauneuf-du-Pape 12,0 ; Vaucluse rhodanien 9,2 ;
   Val Saint Grégoire 11,6 ; Côte de Nuits-Villages 10,7.
2. **Tuiles** : chaque aire porte son `reveal_zoom` (R) et celui de son
   parent (`parent_reveal_zoom`, P). Les points d'étiquette des crus
   partent de z10.
3. **Lecture d'un lieu** (`src/components/map/reveal.ts`) :
   - dessiné et nommé à partir de **S = max(P − 1, R − 3,5)** : le parent
     couvre ~30 % de l'écran et le lieu lui-même au moins ~5 % ;
   - à **R** il passe la main : remplissage → lavis léger (nul à R + 1,5),
     nom déplacé le long du contour, contour brun neutre ;
   - à **R + 2** (le lieu fait 4× l'écran) contour et nom de bord
     disparaissent.
   Les crus (feuilles) restent dessinés ; leur lavis s'efface un zoom
   après leur apparition, les vignes portent la couleur.
4. **Vignes** : seuil de leur contexte local, calculé dans `wine_mvt` : le
   plus petit de l'emprise des vignes de leur commune et de leur appellation
   village / cru (si elle est de taille appellation, R ≥ 11,5), borné à
   [11,5 ; 13] — jamais plus tard qu'avant. L'emprise par commune vit dans
   la petite table `vine_commune_reveal` : réécrire tout `vine_plots`
   dépassait le délai de l'éditeur SQL. L'emprise est prise sur les centres
   des vignes (migration 0021), pas sur leurs polygones. Les tuiles servent les vignes dès
   z11, seulement là où ce contexte est révélé tôt (`reveal_zoom < z + 1,5`) :
   les tuiles z11–12 restent légères.
5. **Taille d'écran** : le client décale tous les seuils de
   `log2(petit côté / 1024)` (borné à [−1,25 ; +0,25]), recalculé au
   redimensionnement. Un téléphone révèle plus tôt, à part d'écran égale.
6. **Interaction** : un lieu pas encore révélé (transparent) ne prend ni le
   survol ni le clic (`isRevealed`, même règle qu'en style).

## Conséquences

- MapLibre n'accepte `["zoom"]` qu'en entrée d'un `interpolate` de premier
  niveau : les seuils par lieu sont écrits dans chaque palier d'une grille de
  zoom (pas 0,5). Les expressions composites sont évaluées aux zooms entiers
  puis mélangées : les fondus durent environ un niveau de zoom.
- Une étiquette cachée a une taille 0 (pas seulement une opacité 0) : sinon
  elle gagnerait les collisions contre les noms lus.
- Après une ré-ingestion : `select wine_areas_refresh_map_style('<region>');`
  recalcule aussi les `reveal_zoom` des aires et `vine_commune_reveal`
  (ou `select wine_map_refresh_reveal_zoom('<region>');` seul).
- Tant que la migration 0020 n'est pas appliquée, le client retombe sur les
  anciennes bandes (R / P par niveau, vignes à 13) : rien ne casse.
- Les lieux-dits et parcelles INAO restent servis à partir de z13.
- Remplace les bandes `AREA_BANDS` de l'ADR 0022 ; le reste de l'ADR 0022
  (couleurs, une étiquette par zone, crus dorés / brique) est inchangé.

## Complément — contours de crus (même revue)

- Alsace et Bourgogne : contours des grands / premiers crus ~1,8× plus
  épais, sur un liseré clair presque opaque dès z10,5 (le brique se perdait
  dans les vignes rouges de la lecture « score »). Champagne inchangée
  (crus = communes entières).
- Doubles traits : l'union des parcelles INAO laissait des trous de
  quelques m² et des encoches étroites, dessinés comme des traits dans le
  cru (Marckrain : 9 trous, 1,8 km de traits parasites). Migration 0022 :
  `geom_display` des crus = fermeture de 3 m puis trous < 2 500 m² retirés ;
  `geom` reste la référence.
