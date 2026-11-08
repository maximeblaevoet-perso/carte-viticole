# Score terroir des vignes plantées et domaines estimés

Méthode du score de potentiel terroir par parcelle et du score composé des
domaines de référence. Décisions : ADR 0016, ADR 0019, ADR 0021. Code :
`scripts/terroir_score.py` (calcul), `scripts/build_vineyard.py` (chaîne par
région), `src/lib/terroir-score.ts` (affichage). Grilles :
`src/data/terroir-score-alsace.json`, `src/data/terroir-score-bourgogne.json`.

> **Indicatif.** Le score est une lecture homogène de critères publics. Ce
> n'est ni un classement officiel, ni une mesure de la qualité d'un vin. Il
> ignore ce qui fait la différence entre deux coteaux voisins : profondeur et
> réserve en eau du sol, âge des vignes, matériel végétal, conduite.

## 1. Les vignes

| Source | Rôle |
| --- | --- |
| RPG (IGN, déclarations PAC, groupe 21) | Vignes déclarées l'année du millésime RPG, avec le statut bio |
| BD TOPO IGN (`zone_de_vegetation`, nature « Vigne ») | Vignes vues sur orthophoto mais non déclarées, seulement hors RPG, > 0,15 ha |
| Parcellaire INAO | Filtre : la vigne doit être dans l'aire AOC Alsace. Donne aussi l'appellation et le grand cru |
| Cadastre Etalab | Lieu-dit au centre de la vigne |

## 2. Les critères

Chaque critère est une valeur dans [0, 1]. Score = 100 × Σ(poids × valeur) / Σ poids.

| Critère | Poids | Donnée | Lecture |
| --- | --- | --- | --- |
| Géologie | 35 | Formation BD Charm-50 dominante sous la vigne (surface) | Famille de roche : calcaire, granite, volcanique, schiste ≈ 0,9–0,95 ; grès, marne 0,8 ; lœss 0,5 ; alluvions 0,2 |
| Exposition | 25 | RGE ALTI, direction de la plus forte pente (centre ± 30 m) | Lecture **soleil** : S/SE 1,0, SO 0,9, E 0,75, N 0,3. Lecture **fraîcheur** : inversée. Plat (< 2 %) : 0,55 |
| Pente | 15 | Idem | < 1 % 0,2 ; < 3 % 0,45 ; < 8 % 0,75 ; < 15 % 0,95 ; < 30 % 1,0 ; < 45 % 0,85 ; au-delà 0,6 |
| Altitude | 10 | RGE ALTI au centre | < 190 m (plaine) 0,3 ; < 220 m 0,55 ; < 250 m 0,75 ; < 300 m 0,9 ; < 380 m 1,0 ; < 450 m 0,9 ; au-delà 0,7 |
| Sol | 15 | Sol dominant RRP 1/250 000 (INRAE) | Rendosol/Calcosol 0,85–0,9 ; Brunisol 0,7 ; Luvisol 0,45 ; Fluviosol 0,2 |

Les familles de roche suivent `src/lib/geology-formation.ts` : les formations
superficielles (éboulis, colluvions, lœss, alluvions) sont reconnues en
premier, car c'est là que la vigne s'enracine ; sinon, la première lithologie
citée dans le libellé BRGM l'emporte.

Limites connues : pente et exposition sont des valeurs **locales** (5 points),
pas une moyenne de parcelle ; le sol RRP décrit un paysage de sols au
1/250 000, pas le sol de la parcelle ; la géologie est la formation
**dominante** (la part est stockée dans `geol_dominant_share`).

## 2 bis. Bourgogne (ADR 0021)

Grille `src/data/terroir-score-bourgogne.json`. Mêmes cinq critères,
pondération géologie 30, exposition 20, pente 20, altitude 15, sol 15.

| Différence avec l'Alsace | Raison |
| --- | --- |
| Exposition : E 0,95, SE 1,0, S 0,95, SO 0,95 | La Côte regarde l'est ; la colline des grands crus de Chablis le sud-ouest |
| Pente : 1,0 de 8 à 40 % | Les grands crus de Chablis et Corton-Charlemagne sont raides |
| Altitude **par secteur** (`altitude_secteurs`) | Niveau de base 130 m à Chablis, 240 m en Côte d'Or ; Hautes-Côtes (350-500 m) plus fraîches |
| **Motifs de libellé** (`geologie_motifs`) | Kimméridgien 1,0 / Astartes 0,85 / Portlandien 0,75 ; « Colluvions diverses » de la Côte 0,75 ; remplissages tertiaires de plaine 0,4 |

Chaque vigne porte aussi son **niveau de cru** INAO (`cru_level`). Il n'entre
pas dans le score : il sert à le **contrôler** (médiane par niveau et par
secteur à chaque run). Résultat au 2026-11-06 :

| Secteur | Grand cru | 1er cru | Village | Régional |
| --- | --- | --- | --- | --- |
| Côte de Beaune | 94,5 | 92,5 | 84,0 | 77,8 |
| Côte de Nuits | 88,0 | 89,0 | 83,0 | 80,2 |
| Chablis | 93,8 | 95,5 | 85,5 | — |
| Côte Chalonnaise | — | 92,2 | 85,5 | 80,8 |
| Mâconnais | — | 94,5 | 86,0 | 85,2 |
| Grand Auxerrois | — | — | 85,8 | 92,5 |

Grands et premiers crus se valent à 2 points près (les critères publics ne
séparent pas deux climats voisins) ; l'Auxerrois est une exception attendue
(Saint-Bris et Irancy sont des AOC village par le cépage). Voir
`docs/mode-op-replication-region.md` (A10, A11).

## 3. Les domaines

`scripts/data/alsace-domains.json`, compilé à la main (sites des domaines,
guides, presse) : commune du chai, surface déclarée, grands crus, lieux-dits,
sources, confiance. `source_type = manual`. Champs facultatifs (ADR 0019) :
`communes` (où sont les vignes), `surfaces_ha` (surface d'un cru ou lieu-dit,
milieu de la fourchette publiée), `surface_grands_crus_ha` (total en grands
crus), `lieux_dits_cadastre` (nom d'usage → commune + lieux-dits cadastraux).

### Score composé (estimation, ADR 0019)

Aucune parcelle n'est attribuée à un domaine : on ne sait pas lesquelles il
exploite. Sa note est composée de ce qu'il déclare :

1. **Grands crus et lieux-dits déclarés** : chacun compte pour sa surface
   déclarée, plafonnée par les vignes plantées du lieu ; sinon pour
   min(25 % des vignes du lieu ; 12 % de la surface du domaine). Un total
   déclaré en grands crus est réparti entre les crus sans surface propre. Le
   lieu est noté à la moyenne de ses vignes.
2. Un lieu-dit déclaré situé surtout dans un cru déclaré **épingle** ce cru
   (Clos Saint-Urbain → Rangen côté Thann).
3. **Reste** de la surface : moyenne des vignes hors grand cru des communes du
   domaine (déclarées, sinon celle du chai). Les anciennes communes fusionnées
   (Kaysersberg, Kientzheim, Sigolsheim) sont lues comme Kaysersberg
   Vignoble.
4. Score = moyenne des tranches pondérée par leur surface. Si les lieux
   dépassent la surface du domaine, ils sont réduits proportionnellement.

Exemple, Zind-Humbrecht (40 ha) : Rangen côté Thann 5,5 ha déclarés (83),
Brand, Hengst, Goldert 4,8 ha chacun par défaut (88, 87, 86), Windsbuehl
1,1 ha (95), Herrenweg de Turckheim 4,6 ha (49), reste 14,4 ha à la moyenne de
Turckheim, Wintzenheim, Hunawihr, Gueberschwihr et Thann (66) → **74,8**.

### Indicateurs publiés

| Indicateur | Définition |
| --- | --- |
| Score (soleil / fraîcheur) | Moyenne des tranches de la composition, pondérée par leur surface |
| Composition | Par tranche : lieu, surface retenue et sa base (déclarée, répartie, défaut, reste), score, contour |
| Non localisés | Lieux déclarés introuvables sur les vignes plantées (comptés dans le reste) |
| Score secteur | Toutes les vignes à 1,5 km du chai, pour comparaison |
| Confiance | Haute / moyenne / basse : part de surface déclarée, communes déclarées, fiche bien sourcée |

La fiche ne présente **jamais** une parcelle comme celle d'un domaine : le
casier viticole est confidentiel et le RPG anonymise l'exploitant. Une vigne
indique seulement les domaines qui déclarent son cru ou son lieu-dit.

## 4. Mettre à jour

```bash
python scripts/build_alsace_vineyard.py                    # dry-run, résumé
python scripts/build_alsace_vineyard.py --commit --prune   # écrit vine_plots / wine_domains, allège
python scripts/build_alsace_vineyard.py --domains-only --commit  # domaines seuls, depuis le cache
cd scripts && python -m unittest test_terroir_score
```

Modifier les poids ou barèmes : éditer la grille JSON, relancer le script
(les caches réseau de `data/processed/alsace/` évitent tout re-téléchargement).
