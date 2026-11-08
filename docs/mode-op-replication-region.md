# Mode opératoire — répliquer la chaîne « vignes plantées » sur une région

Document vivant. Il décrit comment reproduire sur une nouvelle région ce qui a
été construit pour l'Alsace (ADR 0016 à 0020) : aires d'appellation, vignes
réellement plantées, score terroir par parcelle, géologie / relief / sol,
lieux-dits découpés aux vignes, domaines de référence. Chaque région traitée
enrichit la section « Anomalies et difficultés » : on y note ce qui a cassé,
pourquoi, et la règle retenue, qu'elle vienne d'une auto-relecture ou d'une
revue humaine.

Régions : Alsace (référence, faite) · **Bourgogne (en cours, ADR 0021)**.

### État Bourgogne (2026-11-06)

| Étape | État |
|-------|------|
| 1-3 Inventaire INAO, téléchargements | fait (A1) |
| 4-5 Configuration, grille | fait, grille calibrée en 2 passes (A9, A10) |
| 6 Dry-run | 39 128 vignes, 29 653 ha (RPG 15 588, BD TOPO 14 065) ; test de hiérarchie OK sauf Auxerrois (A11) |
| 7 Migration 0016 | appliquée (revue humaine) |
| 8 Domaines | 40 domaines, 1 lieu non localisé (A12) |
| 9 Commit | fait : 847 aires, 40 domaines, 39 128 vignes, 7 806 lieux-dits, 0 erreur |
| 10 Front | vérifié à l'écran (Vosne-Romanée, Chablis) : vignes, contours grands crus, coloration « Niveau de cru », fiche avec la grille Bourgogne, domaines déclarants ; 0 erreur console. Point ouvert A14 |
| 11 Docs | ADR 0021, `terroir-score.md`, ce document |

Non-régression Alsace : run complet depuis le cache après la refonte,
scores des 49 866 vignes et des domaines identiques au centième.

## 0. Vue d'ensemble

```
INAO parcellaire ──► aires (wine_areas, niveaux 2-5) ─────────────┐
RPG + BD TOPO ─────► vignes dans l'aire AOC ──► classement cru ──►│ vine_plots
BD Charm-50 ───────► géologie dominante ─────┐                    │
RGE ALTI ──────────► altitude / pente / expo ├► score (grille) ──►┘
INRAE RRP ─────────► sol dominant ───────────┘
Cadastre Etalab ───► lieu-dit au centre ; lieux-dits ∩ vignes ──► wine_lieux_dits
Domaines (JSON manuel) ► lieux déclarés résolus sur les vignes ──► wine_domains
```

Un seul script : `scripts/build_vineyard.py --region <id>` (Alsace :
`build_alsace_vineyard.py` reste un alias). Tout ce qui est propre à une région
vit dans sa configuration (`REGIONS` en tête du script) et dans sa grille
`src/data/terroir-score-<region>.json`.

## 1. Checklist par région

| # | Étape | Commande / fichier | Contrôle |
|---|-------|--------------------|----------|
| 1 | Départements de la région | `SCOPE_DEPARTMENTS` dans `scripts/wine_geodata_download.py` | — |
| 2 | Inventaire INAO : apps, dénominations, niveaux | lecture du shapefile parcellaire national (filtre `insee` par département) | la hiérarchie officielle est-elle lisible dans `app` / `denom` / `type_denom` ? |
| 3 | Télécharger cadastre lieux-dits + BD Charm-50 | `ingest_bdcharm50.ensure_archive`, cadastre (voir A1) | fichiers sous `data/raw/wine-geodata/` |
| 4 | Configurer la région | `REGIONS[...]` : bbox, départements, filtre d'aire, classement, secteurs | — |
| 5 | Grille de score | `src/data/terroir-score-<region>.json` | barèmes justifiés par la géographie, **jamais** par le classement |
| 6 | Dry-run | `python scripts/build_vineyard.py --region <id>` | résumé : ha, sources, familles géologiques, **test de hiérarchie** |
| 7 | Migration SQL si le modèle bouge | `supabase/migrations/NNNN_*.sql` | appliquée avant `--commit` |
| 8 | Domaines de référence | `scripts/data/<region>-domains.json` | noms identiques aux noms INAO (script de contrôle) |
| 9 | Commit | `--commit` (aires, vignes, lieux-dits, domaines) | carte au zoom 13+, popups, panneau |
| 10 | Front | grille par région, `DOMAIN_REGIONS`, communes à lieux-dits transparents, `DEPT_REGION`, `wine_areas_refresh_map_style` | revue visuelle zoom 6 → 15 et sur portable (A15) |
| 11 | Docs | ADR, `terroir-score.md`, ce mode op | — |

### Test de hiérarchie (étape 6)

Le score ne lit **pas** le classement officiel : il est calculé sur la
géologie, l'exposition, la pente, l'altitude et le sol. Le classement sert
de **contrôle** : la médiane des scores doit décroître grand cru > premier
cru > village > régional, sous-région par sous-région. Si ce n'est pas le
cas, on cherche une cause physique (barème inadapté, donnée fausse) et on la
documente ici — on n'ajoute jamais le classement comme critère du score.

## 2. Sources et pièges connus

| Source | Accès | Piège |
|--------|-------|-------|
| INAO parcellaire | shapefile national local | Champagne absente ; aires = commune × dénomination, pas des parcelles |
| RPG | WFS `RPG.LATEST:parcelles_graphiques`, `code_group='21'` | pagination 5 000 ; doublons `num_parcel` |
| BD TOPO | WFS `BDTOPO_V3:zone_de_vegetation`, `nature='Vigne'` | recouvre le RPG : soustraction indexée |
| BD Charm-50 | InfoTerre, ~150 Ko/s | archives tronquées : une relance |
| RGE ALTI | service altimétrique, 3 000 points / requête | -99999 hors MNT |
| INRAE RRP | WFS sols dominants | « à » cassé (U+FFFD) |
| Cadastre | `cadastre.data.gouv.fr` → redirection S3 OVH | voir A1 |

## 3. Anomalies et difficultés

Format : **contexte → symptôme → cause → règle retenue**. Origine :
(auto) relecture de mes propres erreurs, (revue) remarque humaine.

### A1 — Cadastre : certificat refusé par Python (Bourgogne, auto)
`download_cadastre_department` échoue pour 21/71/89 :
`CERTIFICATE_VERIFY_FAILED … certificate has expired`. `curl` (magasin de
certificats Windows) télécharge sans erreur la même URL. Cause probable : le
bundle `certifi` ne valide plus la chaîne du stockage S3 vers lequel redirige
`cadastre.data.gouv.fr`. **Règle** : ne pas désactiver la vérification TLS ;
télécharger avec `curl -L` dans `data/raw/wine-geodata/etalab-cadastre/departements/<dep>/`
puis `gunzip` vers `cadastre-<dep>-lieux_dits.geojson`.

### A2 — La grille alsacienne ne se transpose pas telle quelle (Bourgogne, auto)
L'Alsace note le mieux 300-380 m d'altitude et le plein sud. En Bourgogne :
les grands crus de Chablis sont entre 130 et 250 m, ceux de la Côte d'Or vers
250-320 m, les Hautes-Côtes (régional) à 350-500 m ; la Côte regarde l'est.
Une grille unique aurait favorisé les Hautes-Côtes et pénalisé Chablis.
**Règle** : une grille par région, et des barèmes d'altitude **par secteur**
(`altitude_secteurs`) quand la région couvre plusieurs niveaux de base.

### A3 — Chablis : Kimméridgien contre Portlandien (Bourgogne, auto)
Le libellé BD Charm-50 du Kimméridgien commence souvent par « Marnes… », celui
du Portlandien par « Calcaires… ». Par famille de roche, la grille alsacienne
(calcaire 0,95 > marne 0,8) mettrait le Petit Chablis (plateau portlandien)
au-dessus des grands crus (marnes kimméridgiennes). **Règle** : la grille
peut porter des motifs de libellé (`geologie_motifs`, regex sur le libellé
replié) qui priment sur la famille, pour les étages géologiques qui font le
terroir local. Les motifs sont documentés dans `docs/terroir-score.md`.

### A4 — Communes beaujolaises en Saône-et-Loire (Bourgogne, auto)
Le département 71 contient des communes des crus du Beaujolais (Saint-Amour,
Chénas, Moulin-à-Vent…), dont l'aire « Bourgogne » couvre aussi les vignes.
**Règle** : une vigne dont l'appellation la plus précise est beaujolaise
(Beaujolais, Beaujolais-Villages, crus) et qui n'est dans aucune appellation
communale bourguignonne est exclue de la région `bourgogne`.

### A5 — Grand cru = appellation, premier cru = dénomination (Bourgogne, auto)
En Alsace, le grand cru est une dénomination (« Alsace grand cru Rangen »). En
Bourgogne, chaque grand cru de la Côte d'Or est une **appellation** à part
entière (« Chambertin »), les grands crus de Chablis sont des dénominations
de « Chablis Grand Cru », et les premiers crus sont des dénominations
« <village> premier cru <climat> » plus une dénomination parapluie
« <village> premier cru ». **Règle** : classement par vigne = rang maximal
parmi toutes les aires INAO qui la contiennent ; nom = dénomination la plus
précise du rang retenu (le climat nommé plutôt que la parapluie).

### A6 — BD TOPO : 504 sur une grande emprise (Bourgogne, auto)
La requête WFS `zone_de_vegetation` sur l'emprise bourguignonne (≈ 2° × 2°)
répond « 504 Gateway Time-out » à chaque essai ; le RPG, plus léger, passe.
**Règle** : `wfs_features(..., tile_deg=0.4, key="cleabs")` découpe l'emprise
en tuiles et dédoublonne les objets à cheval. Un run interrompu reprend le
RPG depuis le cache (`data/processed/<region>/rpg_raw.gpkg`).

### A7 — Premiers crus absents de l'INAO en tant que dénomination (Bourgogne, auto)
Plusieurs premiers crus de Chablis (Montée de Tonnerre, Vaillons, Montmains,
Forêt, Butteaux…) ne sont pas des dénominations du parcellaire : leurs vignes
portent seulement la parapluie « Chablis premier cru ». Les domaines qui les
déclarent sont rattachés à cette parapluie (note dans `surface_note`), donc à
la moyenne de tous les premiers crus chablisiens non nommés. Côte Bouguerots
(Fèvre) est compté dans Bougros. **À revoir** si l'INAO publie ces climats.

### A9 — Grands crus disparus : vignes à cheval sur plusieurs climats (Bourgogne, auto)
Premier passage : aucune vigne en Romanée-Conti, La Romanée, Clos de Tart,
Charmes-Chambertin ni Clos Saint-Jacques. En Côte d'Or, la BD TOPO couvre
près de la moitié des vignes avec des polygones de 15-18 ha : un seul polygone
contient Romanée-Conti, La Romanée et deux premiers crus, et il est classé par
son point central. Charmes, lui, disparaissait parce que son aire contient
Mazoyères (qui peut se vendre en Charmes) et que la règle « nom le plus long »
choisissait Mazoyères partout. **Règles** : (1) en Bourgogne, chaque vigne est
découpée aux limites des aires INAO village / premier cru / grand cru avant
classement (`split_by_aires`, morceaux < 2 a ou < 4 m d'épaisseur ignorés,
id suffixé `-sN`) ; (2) à rang égal, l'aire **la plus petite** est la plus
précise (climat nommé > parapluie, Mazoyères > Charmes là où les deux
existent, Meursault > Côte de Beaune-Villages). Une région où les climats sont
petits doit toujours passer par ce découpage.

### A10 — Ce que la géologie au 1/50 000 ne voit pas (Bourgogne, auto)
- Chablis : « Calcaires et marnes à Exogyra virgula (Kimméridgien) » porte
  98 ha de grands crus et 698 ha de premiers crus ; « Calcaires du Barrois
  (Portlandien) » porte surtout le plateau. Motifs : Kimméridgien 1,0,
  Astartes 0,85, Portlandien 0,75.
- Côte de Nuits : « Colluvions diverses » recouvre 1 538 ha, tous niveaux
  confondus (227 ha de grands crus, 761 ha de villages). La carte ne distingue
  pas le mi-coteau du piémont : motif 0,75 (colluvions calcaires de versant),
  la discrimination revient à la pente et à l'altitude.
- Les marnes fluvio-lacustres de Saint-Cosme et le « complexe saumon »
  dijonnais (remplissages tertiaires de plaine) : 0,4.
- Pentes : les grands crus de Chablis (Blanchot 27 %) et Corton-Charlemagne
  (20 %) sont raides ; le barème ne baisse qu'au-delà de 40 %. Exposition
  SO 0,95 : la colline des grands crus de Chablis regarde le sud-ouest.

### A11 — Exceptions attendues au test de hiérarchie (Bourgogne, auto)
- **Grand Auxerrois** : Saint-Bris (sauvignon) et Irancy sont des AOC
  village pour leur cépage et leur histoire, pas pour un meilleur coteau que
  les dénominations régionales voisines (Côtes d'Auxerre, Chitry, Épineuil).
  Un régional au-dessus du village n'y est pas une anomalie du score.
- **Grands crus contre premiers crus** : à la même altitude, sur la même
  colluvion, avec la même pente, les critères publics ne séparent pas un
  grand cru de son premier cru voisin. Le bas du Clos de Vougeot (3 % de
  pente, 246 m) est un cas connu de grand cru en piémont. On attend
  GC ≈ 1er > village > régional, pas un écart net GC > 1er.

### A12 — Aires superposées d'appellations différentes (Bourgogne, auto)
- « Charlemagne » est un grand cru légal entièrement contenu dans
  Corton-Charlemagne et presque jamais revendiqué ; avec la règle « plus
  petite aire » (A9) il prenait toutes les vignes de Corton-Charlemagne.
  **Règle** : `BGY_ALIAS_GC` — un tel alias ne nomme une vigne que si rien
  d'autre ne la nomme.
- « Sous le Dos d'Âne » est à la fois Meursault 1er cru (blanc) et Blagny
  1er cru (rouge) : la vigne porte l'aire la plus petite, et Leflaive qui
  déclare la version Meursault reste « non localisé ». **À traiter** : garder
  toutes les aires de même rang d'une vigne (liste) plutôt qu'une seule.

### A13 — Construction des aires : contrôles à sec avant commit (Bourgogne, auto)
Le code des aires ne tourne qu'au `--commit` : il a été testé à sec avant
(846 aires). Deux défauts trouvés : « Blagny » n'existe qu'en dénominations
(pas de ligne « Blagny » seule), 17 vignes pointaient vers une aire absente ;
et les 50 aires régionales pesaient ~4 Mo de WKT chacune. **Règles** : une
appellation village sans ligne propre reçoit l'union de ses dénominations ;
les aires régionales masquées restent dans l'arbre **sans contour**. Contrôle
à faire à chaque région : 0 vigne sans aire, 0 aire visible sans contour.

### A14 — Rampe de couleur du score peu contrastée en Bourgogne (ouvert, auto)
Les scores bourguignons se tassent entre 80 et 95 (médianes des coteaux
88-95) ; `SCORE_RAMP` sature à 90, calé sur l'Alsace. Sur la carte, les
coteaux de Chablis ou de Vosne sont presque uniformément bleu foncé ; la
plaine ressort, mais grands crus et premiers crus se distinguent mal. **Piste** :
rampe par région, ou rampe relative (quantiles de la région) — à décider.

### A15 — Lisibilité de la carte : zoom, couleurs, mobile (Bourgogne, revue)
Revue de la carte en Bourgogne : tout le morcellement visible dès le zoom 7,
des dizaines de « Côte de Beaune », un trou entre zoom 11 et 13 dans le
Mâconnais, bords des niveaux supérieurs perdus, noms de lieux-dits répétant
ceux des crus, rouge agressif, fiche mobile impossible à refermer. Causes :
secteurs et villages dans la même couche et la même couleur, étiquettes de
polygones (une par fragment et par tuile), aires coupées à `zoom_max`.
**Règles** (ADR 0022, migration 0017) :
- après tout commit des aires d'une région, lancer
  `select wine_areas_refresh_map_style('<region>');` (couleur par zone sans
  voisine identique, point d'étiquette, nom court des crus) ;
- contrôle visuel à l'étape 10, du zoom 6 au zoom 15 sans palier vide :
  un seul nom par secteur, chaque zone visible à chaque zoom (y compris les
  secteurs sans village ni cru, comme le Mâconnais), contour et nom du
  niveau supérieur toujours présents ;
- vérifier sur portable (375 px) : fiche repliable / fermable, légende des
  vignes repliable, région du bandeau bas = région de la parcelle cliquée ;
- une nouvelle région hors Alsace / Bourgogne / Champagne : ajouter ses
  départements à `DEPT_REGION` (`WineMap.tsx`) pour que la région suive le
  clic sur une parcelle ou un lieu-dit.

### A8 — Le shell de l'outil interprète les `\n` des heredocs (auto)
Un script Python passé par heredoc a vu ses `"\n"` transformés en vrais
retours à la ligne : chaînes non terminées. **Règle** : écrire les scripts et
les blocs de code avec l'outil d'écriture de fichiers, pas par heredoc.
