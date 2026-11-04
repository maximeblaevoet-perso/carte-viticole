# ADR 0020 — Palette géologique des vignes par grands groupes de sols viticoles

## Status

Accepted — 2026-11-04. Complète l'ADR 0016 (coloration des vignes plantées).

## Context

Le mode « Géologie » des vignes plantées colorait chaque famille de roche
(`terroir_score.FAMILIES`) avec une teinte isolée. Trois défauts :

- **Trop de beiges et de bruns** : alluvions, cailloutis, colluvions, éboulis,
  soliflués, lœss, limons, conglomérat, grès, argile se ressemblaient.
- **Légende en vrac** : l'ordre d'insertion de l'objet, sans regroupement ;
  marne et marnes à gypse n'étaient pas lues comme proches.
- **Familles non coloriées** : craie, travertin, gaize, brèche, quartzite,
  roche magmatique, métamorphique basique, eau, dépôts glaciaires, tourbe,
  remblais tombaient sur le gris « autre ».

## Decision

Les familles sont regroupées comme le monde du vin parle des sols
(calcaire, argilo-calcaire, siliceux, granitique, schisteux, volcanique,
alluvial), **une teinte par groupe, du clair au foncé à l'intérieur** :

| Groupe | Teinte | Familles |
| --- | --- | --- |
| Calcaires et craies | bleus | craie, travertin, calcaire |
| Marnes et argiles | verts d'eau | marnes à gypse, marne, argile |
| Sables et grès | jaunes → rouille | sable, gaize, grès, conglomérat, brèche, grauwacke |
| Granites | roses | granite, roche magmatique |
| Roches métamorphiques | violets | quartzite, gneiss, micaschiste, schiste, métamorphique basique |
| Roches volcaniques | anthracite | volcanique |
| Formations superficielles | bruns (pente), olives (alluvions, cailloutis, glaciaire), sables pâles (lœss, limons) | éboulis, soliflués, colluvions, glaciaire, cailloutis, alluvions, lœss, limons |
| Autres | divers | eau, tourbe, remblais, autre |

La roche en place vient d'abord, les formations superficielles (terrain
transporté qui recouvre la roche) ensuite, réunies en un seul groupe comme sur
les cartes géologiques ; à l'intérieur, trois sous-teintes distinguent pente,
vallée et dépôts éoliens. `GEOLOGY_GROUPS`
(`src/components/map/vineLayers.ts`) est la source unique : `FAMILY_COLORS`
et la légende en dérivent. La légende affiche un bloc titré par groupe,
défilant si besoin.

Seul l'affichage change : clés, score et données sont inchangés.

## Consequences

- Deux vignes voisines de même groupe (calcaire / craie, marne / marnes à
  gypse) se lisent comme apparentées ; un changement de groupe saute aux yeux.
- Toutes les familles du score ont une couleur propre.
- Ajouter une famille dans `terroir_score.FAMILIES` impose de la placer dans
  un groupe, sinon elle retombe sur le gris « autre ».

## Alternatives rejetées

- **Couleurs de la carte géologique BRGM** (par âge stratigraphique) : lisibles
  pour un géologue, pas pour lire un terroir ; deux calcaires d'âges
  différents y ont des couleurs sans rapport.
- **N'afficher que les familles présentes à l'écran** : légende qui change à
  chaque déplacement ; reportée si la longueur gêne.
