# ADR 0022 — Lecture progressive de la carte, couleurs par zone, mobile épuré

Date : 2026-11-08 · Statut : accepté (migration 0017 à appliquer)

## Contexte

Revue de la carte en Bourgogne (retour utilisateur) :

- dès le zoom 7, tout le morcellement des villages s'affichait ; secteurs et
  villages avaient la même couleur (celle de la région) ;
- l'étiquette d'un polygone se répétait sur chaque fragment et chaque tuile :
  des dizaines de « Côte de Beaune » à l'écran ;
- Mâconnais : entre les zooms 11 et 13, plus rien (les appellations étaient
  coupées à `zoom_max` 10,5, les vignes n'arrivent qu'à 13, et il y a peu de
  crus) — on se perd ;
- les bords du niveau supérieur disparaissaient en zoomant ;
- le nom d'un lieu-dit cadastral répète souvent celui du cru (« LES
  CAILLERETS » dans « Volnay premier cru Les Caillerets ») ;
- le rouge des crus (ADR 0012) était agressif ;
- sur portable, une fois une zone cliquée, la fiche couvrait le sélecteur de
  coloration des vignes sans pouvoir être refermée ; le bandeau
  région / millésime et le titre cachaient le paysage ; la région affichée
  ne suivait pas une parcelle cliquée hors Alsace.

## Décision

1. **Un niveau lu à la fois, en fondu** (`src/components/map/areaLayers.ts`) :
   région (≤ 7,5) → secteurs (7–10,3) → villages / appellations (9,6–12,8)
   → crus (≥ 10,8) → vignes et lieux-dits (≥ 13). Le remplissage d'un niveau
   passe à un voile léger quand le suivant arrive, il ne disparaît jamais :
   il reste toujours quelque chose sous les yeux.
2. **Les contours ne sont plus coupés par zoom** (migration 0017,
   `wine_mvt`) : région, secteurs et villages sont servis à tous les zooms
   (géométrie découpée à la tuile avant simplification). Leurs contours sont
   dessinés **au-dessus** des vignes ; quand le niveau n'est plus celui qu'on
   lit, son contour passe à un brun neutre (`PARENT_EDGE_COLOR`) et son nom
   court le long du contour, de la même couleur : un contour violet
   (Bourgogne) autour d'un secteur jaune pâle jurait. Les parents se
   distinguent alors par l'épaisseur du trait et la taille du nom. Seul le
   niveau **juste au-dessus** garde son contour (empiler région + secteur +
   village faisait trop de traits) : la région s'efface quand on lit les
   villages, le secteur quand on lit les crus.
3. **Une étiquette par zone** : nouvelle couche MVT `wine-areas-labels`,
   un point par aire (`wine_areas.label_point`, sur la plus grande partie).
4. **Une couleur par zone** : `wine_areas.map_color_idx` (0–7), coloration
   gloutonne qui garantit que deux voisines du même niveau (à moins de
   ~150 m) n'ont pas la même teinte ; palette pastel inspirée des cartes des
   vins imprimées, avec une « encre » foncée de la même teinte pour contours
   et noms. Sur l'aérien, l'encre passe dans le halo (texte blanc).
5. **Crus** : doré pour les premiers crus, orange brique pour les grands crus,
   dans toutes les régions (y compris l'Alsace et la lecture « Niveau de
   cru » des vignes). Remplace le rouge de l'ADR 0012. Le contour des deux
   rangs est redessiné au-dessus des vignes (généralise l'ADR 0018).
6. **Noms de crus distincts des lieux-dits** : le cru affiche son nom court
   (`short_name`, sans « Volnay premier cru ») et une petite ligne
   « 1ER CRU » / « GRAND CRU » dans la couleur du rang ; le lieu-dit est plus
   petit, gris, et masqué quand son nom est contenu dans celui de son cru.
7. **Mobile** : la fiche a trois positions (repliée en barre / aperçu /
   déployée) et une croix qui ferme la sélection ; la légende des vignes se
   replie (repliée par défaut sur portable) ; le bandeau supérieur est masqué
   et région + millésime passent dans une barre fine en bas de la carte.
8. **Région suivie au clic** : la région racine d'une entité réelle vient de
   `root_region_id`, sinon du département de `commune_insee` (parcelles,
   lieux-dits). Version des tuiles incrémentée pour ne pas relire des tuiles
   en cache antérieures à la migration 0016 (sans `root_region_id` sur les
   vignes, d'où le repli sur l'Alsace).

## Conséquences

- La couleur d'une zone est **cosmétique** : elle ne porte aucune donnée.
- Après une ré-ingestion des aires d'une région, relancer
  `select wine_areas_refresh_map_style('<region>');` (sinon couleurs et
  points d'étiquette manquent pour les nouvelles lignes : la carte retombe
  sur la couleur de la région et sur `ST_PointOnSurface`).
- `zoom_max` n'est plus une coupure de tuile pour les aires ; il reste
  descriptif. Les bandes de lecture vivent dans `AREA_BANDS`.
- Tant que la migration 0017 n'est pas appliquée : pas d'étiquettes au
  centre des zones, couleurs de région, ancien découpage par zoom.
