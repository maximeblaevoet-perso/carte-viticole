# ADR 0014 — Le sous-sol vient de BD Charm-50 (1/50 000), plus du 1/1 000 000

## Status

Accepted — 2026-09-14

## Context

ADR 0011 puis 0013 ont construit la carte « Sous-sol » sur la seule couche
BRGM interrogeable nationalement, `LITHO_1M_SIMPLIFIEE` — la carte lithologique
simplifiée au **1/1 000 000**. L'ADR 0013 signalait déjà l'écart : le fond
affiché est la carte géologique au 1/50 000, l'étiquette lue vient du
1/1 000 000, « une famille de roche, pas la formation exacte ».

Cet écart s'est révélé bien plus grave qu'une perte de précision. Un
utilisateur a signalé que le Grand Cru **Steinert** (Pfaffenheim) était annoncé
« Sous-sol de roches volcaniques » par l'application, alors que le CIVA le
décrit comme « un terroir homogène dans le Dogger oolithique ». Vérification
faite en interrogeant la couche sur le parcellaire INAO des 51 grands crus
d'Alsace :

- Le Steinert tombe dans le polygone `OBJECTID 845`, `DESCR = 'Basaltes et
  rhyolites'`, d'une surface de **155 km²**. Ce polygone unique couvre **onze
  grands crus** — Hengst, Goldert, Hatschbourg, Eichberg, Pfersigberg,
  Steingrubler, Florimont, Spiegel, Pfingstberg, Zinnkoepflé, Steinert — tous
  plantés sur le champ de fractures de Rouffach–Guebwiller (calcaires et grès
  jurassiques et triasiques).
- Le **Rangen de Thann**, seul grand cru réellement volcanique d'Alsace, est
  rendu « Sables ».

Au 1/1 000 000, cette couche n'est pas une généralisation de la carte
géologique : c'est un dessin distinct, dont les limites sont déplacées de
plusieurs kilomètres. Le champ de fractures, large de 1 à 2 km, n'y est pas
représentable, et la limite du massif vosgien est tirée par-dessus le vignoble.
La couche se trompe dans les deux sens ; elle est donc inutilisable à l'échelle
d'un cru, qui est la seule échelle à laquelle cette application la lit.

Contrôle sur **BD Charm-50** (carte géologique harmonisée au 1/50 000,
téléchargement départemental libre), intersectée avec le parcellaire INAO du
Steinert (38,8 ha) :

| Formation | Surface |
| --- | --- |
| `j2c` — Grande oolithe et marnes à acuminata (Bajocien supérieur) | 16,9 ha |
| `Cp` — Dépôts soliflués (Pléistocène à Holocène) | 17,7 ha |
| `OE` — Lœss et lehms | 3,0 ha |
| `CFz` — Colluvions de fonds de vallons | 1,0 ha |
| `j2a-b` — Bajocien inférieur/moyen, calcaires et marnes | 0,14 ha |
| `E` — Éboulis, cryoclastes | 0,06 ha |

Aucune roche volcanique, et exactement la description du CIVA : l'oolithe en
amont, des éboulis calcaires de même nature en aval. Contre-épreuve : le Rangen
ressort en « tufs rhyolitiques, ignimbrites — strato-volcan du Molkenrain
(Viséen supérieur) », le Zinnkoepflé en Muschelkalk, le Hengst en conglomérats
éocènes. Le désaccord n'était pas entre le BRGM et le CIVA, mais entre deux
produits du BRGM.

BD Charm-50 n'est en revanche **pas servie comme API interrogeable** : le
`GetCapabilities` de `geoservices.brgm.fr/geologie` ne publie la carte
harmonisée au 1/50 000 qu'en raster non interrogeable
(`SCAN_H_GEOL50_SCAN`, `queryable="0"`), et son WFS n'expose que le
1/1 000 000. La donnée vectorielle est libre, mais en téléchargement
départemental.

## Decision

### 1. La géologie est ingérée, pas interrogée à distance

Migration `0012` : table `geology_units` (un polygone BD Charm-50 par ligne,
`NOTATION`, `DESCR`, `CARTE`, provenance) + index GiST, et fonction
`geology_at_point(lon, lat)` qui renvoie la formation sous un point, ordonnée
par surface croissante pour que l'unité la plus spécifique gagne.

`scripts/ingest_bdcharm50.py` télécharge les archives départementales
(`GEO050K_HARM_0DD.zip`) et les **clippe au vignoble délimité** — le parcellaire
INAO du périmètre, dissous et bufferisé de 500 m, exactement le masque déjà
utilisé pour les lieux-dits cadastraux. Sans ce clip, le seul Haut-Rhin
apporterait 7 722 polygones, presque tous en forêt, en plaine ou sur les crêtes.

Le périmètre suit `SCOPE_DEPARTMENTS` : Alsace (67, 68), Champagne (08, 10, 51,
52).

### 2. Le 1/1 000 000 reste, comme repli explicite

`/api/geology?lon=&lat=` répond depuis `geology_units`, et retombe sur
`LITHO_1M_SIMPLIFIEE` hors des départements ingérés ou quand Supabase n'est pas
configuré. La réponse porte toujours son échelle (`"50k"` | `"1M"`) jusqu'à
l'UI : la carte annonce laquelle des deux a répondu, et le libellé de
provenance du repli dit désormais qu'il ne doit pas être lu à l'échelle d'une
parcelle.

L'appel part maintenant du serveur : le navigateur ne parle plus ni au BRGM ni
à Supabase, et la clé de service ne quitte pas le serveur.

### 3. Le libellé BRGM est affiché tel quel, en plus du français simple

`src/lib/geology-formation.ts` déduit une **famille de roche** du libellé (il
n'y a pas de colonne lithologie dans BD Charm-50 : le libellé *est* la
lithologie), par position du premier terme lithologique cité — « Calcaires et
marnes » est un calcaire, « Marnes gréseuses » est une marne. La carte affiche
la famille, sa signification pour la vigne, puis la formation exacte avec son
âge et sa notation (`Grande oolithe et marnes à acuminata — Bajocien supérieur
(j2c)`).

Les **formations superficielles** (éboulis, solifluxion, colluvions, lœss,
alluvions) sont reconnues en premier et signalées comme telles : ce sont elles
que la vigne enracine. Sur le Steinert, elles couvrent 45 % de la surface
délimitée — une carte qui répondrait « calcaire » partout masquerait précisément
la distinction pour laquelle on est passé au 1/50 000.

## Consequences

- La réponse sous un cru est juste, et vérifiable contre les descriptions du
  CIVA et les notices de feuille.
- Le fond affiché et l'étiquette lue proviennent enfin de la même carte.
- Plus de dépendance réseau externe sur le chemin critique du clic, dans les
  départements ingérés.
- Nouvelle dette d'ingestion : chaque région viticole ajoutée demande le
  téléchargement de ses départements (15 à 36 Mo chacun, ~150 Ko/s chez
  InfoTerre). Hors périmètre, la carte retombe sur le 1/1 000 000 et le dit.
- Les couches `S_SURCH` (surcharges), `L_*` (failles) et `P_*` (pendages) de BD
  Charm-50 ne sont pas ingérées.
- **La profondeur de sol reste absente**, comme à l'ADR 0013. BD Charm-50 décrit
  la nature du sous-sol, pas l'épaisseur de terre au-dessus.
