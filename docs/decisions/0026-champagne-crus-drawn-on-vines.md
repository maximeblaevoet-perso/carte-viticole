# ADR 0026 — Crus de Champagne dessinés sur l'emprise de leurs vignes

Date : 2026-11-23 · Statut : accepté

## Contexte

L'ADR 0024 dessinait chaque cru champenois (niveau 4) comme sa **commune
historique entière**, reconstituée depuis les sections cadastrales Etalab.
Retour utilisateur : aux niveaux zone et terroir la carte se lit bien
(contours tirés des vignes), mais dès qu'on zoome les crus forment un
**patchwork de communes** qui couvre forêts, plaines de grande culture et
villages, bien au-delà du vignoble. Les 322 communes font ~352 800 ha pour
~32 700 ha de vignes, soit dix fois trop.

Aucune aire parcellaire vectorielle n'existe pour la Champagne (ADR 0024,
mode op B4) : on ne peut pas découper la commune sur l'aire délimitée.

## Décision

1. **Contour d'un cru = emprise de ses vignes** (RPG / BD TOPO, déjà rattachées
   au cru par commune historique), **découpée sur sa commune** :
   fermeture morphologique +60 m / −40 m (relie les rangs et parcelles d'un
   même coteau par-dessus chemins et haies, sans souder deux coteaux
   distincts), puis intersection avec la commune (pas de débord sur le cru
   voisin), parties < 0,5 ha retirées sauf s'il ne reste rien.
   Résultat : ~42 700 ha dessinés au lieu de ~352 800 ha.
2. Un cru **sans vigne** garde son contour communal, `map_visible = false`
   (inchangé).
3. Le cru reste juridiquement la commune entière : seul son **dessin** change.
   `insee_commune` porte toujours la commune ; les vignes restent rattachées
   par `wine_area_id`, pas par intersection spatiale.
4. `build_vineyard.py --areas-only [--commit]` reconstruit seulement
   `wine_areas` depuis le cache des vignes (upsert, mêmes ids, `vine_plots`
   intact). Puis, dans l'éditeur SQL, une requête à la fois :
   `select wine_areas_refresh_cru_display_geom('champagne');` (contour
   d'affichage des crus, migration 0022 : `refresh_map_style` ne le refait
   pas), puis `select wine_areas_refresh_map_style('champagne');`
   (zones / terroirs, étiquettes, `reveal_zoom`).

## Conséquences

- Les crus apparaissent plus tard (emprise plus petite → `reveal_zoom` plus
  élevé, ADR 0025), ce qui suit la part d'écran réellement occupée par le
  vignoble.
- Un clic hors vignes ne sélectionne plus le cru mais son terroir parent.
- La recherche (ADR 0023) cadre un cru sur son vignoble, pas sur la commune.
- `build_search_index.py` pagine par clé (`id > dernier id`) : la pagination
  par `offset` dépassait le délai de PostgREST sur `vine_plots`.
