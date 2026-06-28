# Product spec

## Mission

Explore French wine vintages through their climate. Help the user understand a
vintage's climate profile, region by region, and compare vintages.

Principles (in order): climate facts first, interpretation second, source
transparency always, synthetic data explicit.

## Climate profiles surfaced

- Millesime solaire (warm/sunny)
- Millesime frais (cool)
- Millesime pluvieux (wet)
- Millesime sec (dry)
- Stress hydrique probable (likely water stress)
- Risque lie a la pluie autour des vendanges (harvest-rain risk)
- Gel de printemps (spring frost)
- Episodes de forte chaleur (heat episodes)

## What the product connects

```
wine region + vintage + historical weather + soil type
+ optional external scores + readable interpretation
```

## V1 scope

- Interactive map of wine France.
- Twelve test regions: **Bordeaux, Bourgogne, Vallee du Rhone, Alsace, Champagne, Loire, Corse, Provence, Beaujolais, Jura, Savoie, Languedoc-Roussillon**.
- Vintages **2000–2024**.
- Region fiche and region × vintage fiche.
- Desktop right-side panel; mobile bottom sheet.
- Vintage-selection timeline.
- Monthly charts (temperature + rainfall).
- Comparison of two vintages in the same region.
- Demo data clearly marked **synthetic**.
- Pipeline prepared to import real Météo-France data.

Explicitly **out of V1**: hardcoding Parker or any protected critic. A generic
`vintage_scores` table is provided instead.

## Vintage fiche contents

- Auto-generated summary
- Climate profile (flags)
- Key indicators
- Temperature & rainfall charts (monthly)
- Tabs: Climat, Sols, Notes, Sources, Methodologie

## Comparison (V1)

Two vintages, same region. Example — Bordeaux 2018 vs Bordeaux 2021:
heat, rain Apr–Sep, rain September, days > 30 °C, days > 35 °C, spring frost,
and the auto profile for each.

## Status (current)

Frontend is implemented on synthetic data. SQL migrations, docs, and a Python
ingestion skeleton are in place. Real-data ingestion and server-side indicator
computation are the next milestones.
