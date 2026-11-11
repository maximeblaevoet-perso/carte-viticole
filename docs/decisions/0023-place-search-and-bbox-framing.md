# ADR 0023 — Recherche de lieux et cadrage sur l'emprise

Date : 2026-11-11 · Statut : accepté (aucune migration)

## Contexte

- Le seul moyen de naviguer sans carte était un menu « région » : impossible
  de trouver directement une appellation, un cru, un lieu-dit ou un domaine.
- La sélection centrait la carte sur le point cliqué à un zoom fixe par
  niveau (`REAL_SELECT_ZOOM`, 8,5 pour une région) : un clic sur la Bourgogne
  n'en montrait qu'un morceau autour du curseur.
- Contrainte forte : temps de réponse, sur ordinateur et sur portable.

## Décision

1. **Index statique, recherche en mémoire.** `scripts/build_search_index.py`
   lit Supabase (lecture seule) et écrit `public/search-index.json` : une
   ligne compacte par lieu (région, sous-région, appellation, village,
   premier / grand cru, lieu-dit, commune viticole, domaine) avec son type,
   sa région racine, son contexte (aire parente ou commune), son **emprise**
   (bbox) et un renvoi vers sa provenance (`ds`). ~16 000 lignes, ~600 Ko
   compressés, chargés **une fois** (au premier focus de la recherche, ou
   quand la carte est prête), puis recherche locale < 1 ms par frappe —
   aucune requête par touche. Les aires de démonstration (`src/data/areas.ts`)
   des régions sans données réelles sont ajoutées côté client, avec leur
   provenance synthétique (`kind: "seed"`).
2. **Correspondance tolérante** (`src/lib/search.ts`) : sans accents ni
   casse, nom exact > début du nom > début d'un mot > tous les mots > sous-chaîne ;
   à égalité, les grands lieux d'abord (région → … → lieu-dit), puis le nom
   le plus court. Les lieux-dits cadastraux en MAJUSCULES sont affichés en
   casse normale.
3. **Le type est toujours affiché** : pastille colorée (Région, Sous-région,
   Village, Appellation, Grand Cru, Premier Cru, Lieu-dit, Commune, Domaine)
   + ligne de contexte (aire / commune · région).
4. **Choisir un résultat** sélectionne le lieu comme un clic (même
   `SelectedGeoFeature`, même fiche, surbrillance réelle) et **cadre son
   emprise** (`frameBBox` dans `WineMap.tsx`), dans la plage de zoom où sa
   couche est dessinée (`zoomRangeFor` : un lieu-dit jamais sous z13,2, un
   cru jamais sous z10,5…). Une commune n'ouvre pas de fiche, elle cadre ses
   vignes ; un domaine ouvre sa fiche et vole vers le chai (ADR 0019).
5. **Clic sur la carte = même cadrage**, quand l'emprise du lieu est connue
   (index) : un clic sur « Bourgogne » montre toute la Bourgogne. Sans
   `force`, le cadrage **ne dézoome jamais** : cliquer le fond de région
   entre deux villages à z10 ne renvoie pas à z7. Les vignes et les ids
   inconnus gardent l'ancien comportement.
6. **Écran** : sur ordinateur, la recherche remplace le menu région dans
   l'en-tête (liste déroulante, flèches / Entrée / Échap). Sur portable, un
   bouton « Rechercher un lieu » dans la barre du bas ouvre une recherche
   plein écran (le clavier ne masque jamais la liste, police 16 px contre le
   zoom iOS). Le cadrage mobile réserve le bas de l'écran à la fiche (≈ 42 %).

## Conséquences

- Il faut **relancer `python scripts/build_search_index.py`** après toute
  ingestion qui ajoute ou renomme des aires, lieux-dits ou domaines, puis
  committer `public/search-index.json`. Un index absent ou en erreur laisse
  la recherche limitée aux aires de démonstration — jamais d'erreur bloquante.
- Les vignes (`vine_plots`, ~89 000 polygones sans nom) ne sont pas indexées
  une à une : on les trouve par leur lieu-dit ou leur commune.
- Pas de nouvelle table ni de migration ; la provenance de chaque lieu réel
  reste portée par l'index (`ds`) et affichée dans la fiche.
- Le menu région de l'en-tête disparaît (la recherche le couvre).
