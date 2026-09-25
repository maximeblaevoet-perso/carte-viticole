# ADR 0015 — L'encart « Sous-sol » ne montre plus la texture SoilGrids

## Status

Accepted — 2026-09-25. Remplace la partie « La terre » de l'ADR 0013.

## Context

L'ADR 0013 empilait deux sources dans l'encart du clic : la roche (BRGM) et la
texture des 30 premiers centimètres (ISRIC SoilGrids, maille 250 m). Depuis
l'ADR 0014, la roche vient de BD Charm-50 au 1/50 000, qui distingue déjà les
formations de couverture (éboulis, lœss, colluvions) — ce que la vigne
enracine. À côté, une texture prédite par un modèle mondial à 6,25 ha le pixel
a été jugée peu pertinente par l'utilisateur, et l'encart trop chargé.

## Decision

- La partie « La terre (0–30 cm) » est supprimée, ainsi que l'appel SoilGrids au
  clic et `src/lib/soil-texture.ts`.
- L'encart est condensé : famille de roche, sa signification pour la vigne,
  libellé BRGM exact (âge, notation), puis une source courte « © BRGM ». Le
  repli au 1/1 000 000 garde la mention « 1/1 000 000, indicatif » pour ne
  jamais passer pour la carte au 1/50 000.
- L'encart se ferme d'un appui (n'importe où dessus, ou sur son ×) : sur
  téléphone il masquait la carte. Le clic suivant sur la carte le rouvre.
- La phrase fixe sur les formations de couverture est retirée : la glose de
  chaque famille superficielle le dit déjà.

## Consequences

- Un seul appel réseau par clic (`/api/geology`).
- Plus aucune information de texture ni de pH dans l'application. Si le besoin
  revient, la piste documentée reste le RRP / DoneSol (INRAE), pas SoilGrids.
