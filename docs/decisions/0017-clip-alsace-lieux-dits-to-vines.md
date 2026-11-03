# ADR 0017 — Lieux-dits d'Alsace découpés sur les vignes plantées

## Status

Accepted — 2026-11-03

## Context

Après l'ADR 0016, `prune_alsace_vineless_geodata()` ne supprimait que les
lieux-dits cadastraux qui ne touchent **aucune** vigne. Un lieu-dit de coteau
qui en touche une seule restait entier : ROSENBURG (68162) gardait 75 ha, dont
65 de forêt ; les lieux-dits de village restaient aussi, dès qu'une vigne en
bordait un. Même sans remplissage, leur contour, leur survol et leur clic
couvraient la forêt et le bâti.

## Decision

`build_alsace_vineyard.py` (`--commit --prune`, ou `--lieux-dits-only` à partir
du cache `vine_plots.gpkg`) remplace la géométrie de chaque lieu-dit alsacien
par **lieu-dit ∩ vignes plantées** (`vine_plots`), puis :

- retire les morceaux < 1 a et les liserés de moins de 4 m de large (contact
  de bord entre une vigne et le lieu-dit voisin) ;
- supprime le lieu-dit s'il lui reste moins de 0,1 ha de vigne (forêt, village).

Le nom, l'identifiant, la commune et la provenance cadastre du lieu-dit ne
changent pas ; seule l'emprise est réduite. L'opération est idempotente.
Aucune migration : les lignes sont réécrites via PostgREST.

## Consequences

- Alsace : 5 380 → 4 546 lieux-dits, 32 313 ha → 15 036 ha (pour 15 288 ha de
  vignes). ROSENBURG (68162) : 75 ha → 10 ha plantés.
- Un lieu-dit n'est plus le contour cadastral officiel en Alsace mais sa part
  plantée. Si le RPG gagne des vignes, l'emprise ne regagne pas de terrain
  d'elle-même : relancer `ingest_wine_geodata.py --commit` (contours complets)
  puis `build_alsace_vineyard.py --commit --prune`.
- Un lieu-dit devient souvent un multipolygone de plusieurs vignes : une
  étiquette posée sur le polygone se répéterait sur chaque morceau. La
  migration `0014` ajoute donc à `wine_mvt` la couche `wine-lieux-dits-labels`
  (un point par lieu-dit, son `center`, recalculé sur la part plantée) ; la
  carte y prend les noms. Tant que `0014` n'est pas appliquée, les noms de
  lieux-dits n'apparaissent pas.
