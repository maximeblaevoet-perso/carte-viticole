# Score terroir des vignes plantées et domaines estimés

Méthode du score de potentiel terroir par parcelle et de l'attribution des
parcelles aux domaines de référence. Décision : ADR 0016. Code :
`scripts/terroir_score.py` (calcul), `src/lib/terroir-score.ts` (affichage).
Grille : `src/data/terroir-score-alsace.json`.

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

## 3. Les domaines

`scripts/data/alsace-domains.json`, compilé à la main (sites des domaines,
guides, presse) : commune du chai, surface déclarée, grands crus, sources,
confiance. `source_type = manual`.

### Attribution des parcelles (estimation)

1. **Cible** : 80 % de la surface déclarée (le reste : vignes louées loin,
   jeunes plantations, écarts entre sources).
2. **Rayon** du domaine : 2,5 km × √(surface / 10 ha), borné à [2 ; 8] km.
3. **Grands crus déclarés** d'abord, jusqu'à 40 km du chai, plafonnés par cru
   à min(25 % des vignes du cru ; 12 % de la surface du domaine).
4. Puis les vignes **libres** les plus proches du chai, en distance relative
   au rayon. Une file unique pour tous les domaines : à distance relative égale,
   le premier servi garde la parcelle ; une parcelle n'a qu'un domaine.
5. Arrêt à la cible, ou au rayon. Jamais d'extrapolation au-delà.

### Indicateurs publiés

| Indicateur | Définition |
| --- | --- |
| Score (soleil / fraîcheur) | Moyenne des scores des parcelles attribuées, pondérée par la surface |
| Score secteur | Toutes les vignes à 1,5 km du chai (ne dépend pas de l'attribution) |
| Couverture | Surface attribuée / surface déclarée (cible 0,8) |
| Part via grands crus | Part de la surface attribuée prise dans un grand cru déclaré |
| Confiance | Haute / moyenne / basse : couverture ≥ 75 %, chai géocodé à l'adresse, surface bien sourcée |

Les parcelles d'un domaine ne sont **jamais** présentées comme un relevé : le
casier viticole est confidentiel et le RPG anonymise l'exploitant.

## 4. Mettre à jour

```bash
python scripts/build_alsace_vineyard.py                    # dry-run, résumé
python scripts/build_alsace_vineyard.py --commit --prune   # écrit vine_plots / wine_domains, allège
cd scripts && python -m unittest test_terroir_score
```

Modifier les poids ou barèmes : éditer la grille JSON, relancer le script
(les caches réseau de `data/processed/alsace/` évitent tout re-téléchargement).
