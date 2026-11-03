# ADR 0018 — Contour des grands crus au-dessus du parcellaire

## Status

Accepted — 2026-11-03

## Context

À partir du zoom 13, parcelles INAO, lieux-dits et vignes plantées (ADR 0016)
se dessinent au-dessus de la couche `wine-areas-cru`. Le contour d'un grand cru,
pourtant épaissi (ADR 0012), disparaît sous ces couches, et son remplissage
rouge teinte toutes les vignes qu'il contient, ce qui gêne la lecture du
score.

## Decision

- Deux couches de ligne dédiées, `real-outline-grand-cru-casing` (liseré clair
  `#fbf7ef`) et `real-outline-grand-cru` (rouge grand cru), filtrées sur
  `region_type = grand-cru`, sont ajoutées **au-dessus des vignes** et sous les
  noms de lieux-dits et les marqueurs de domaines. Elles apparaissent en fondu
  entre les zooms 12,5 et 13,2 ; leur épaisseur croît avec le zoom.
- Pas de remplissage dans ces couches : le remplissage de `wine-areas-cru`
  passe à 20 % de son opacité entre les zooms 12,5 et 13,5.
- Ces couches ne sont ni cliquables (le clic reste à la vigne / au lieu-dit) ni
  repeintes par le thème de fond de carte : leur style tient déjà sur plan,
  aérien et géologie.
- Les premiers crus ne sont pas concernés.

## Consequences

- Le grand cru reste lisible au zoom parcellaire sans masquer les vignes.
- Aucune donnée ni migration : la géométrie vient de la couche MVT
  `wine-areas-cru`, déjà servie jusqu'au zoom maximal.
