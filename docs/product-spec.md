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
- Temperature + rainfall charts, monthly by default with a weekly mode on demand.
- Comparison of two vintages in the same region.
- Demo data clearly marked **synthetic**.
- Pipeline prepared to import real Météo-France data.

Explicitly **out of V1**: hardcoding Parker or any protected critic. A generic
`vintage_scores` table is provided instead.

## Vintage fiche contents

- Auto-generated summary
- Climate profile (flags)
- Key indicators
- Temperature & rainfall charts (monthly by default, weekly on demand)
- Tabs: Climat, Sols, Notes, Sources, Methodologie

## Comparison (V1)

Two vintages, same region. Example — Bordeaux 2018 vs Bordeaux 2021:
heat, rain Apr–Sep, rain September, days > 30 °C, days > 35 °C, spring frost,
and the auto profile for each.

## Status (current)

### Implemented

- The complete frontend flow runs without a database on deterministic,
  visibly-labelled synthetic climate data.
- Climate reads go through `src/data/climate.ts`: real
  `region_vintage_climate` rows are used when Supabase is explicitly enabled,
  with a per-row synthetic fallback when data is absent or unavailable.
- Charts can be switched between the monthly and weekly rollups; monthly stays
  the default and weekly is disabled when a record has none (ADR 0008).
- The map supports a non-uniform hierarchy of wine areas. Provisional editorial
  GeoJSON is always available; sourced PostGIS geometry can be overlaid as
  zoom-gated MVT through `/api/tiles/wine/[z]/[x]/[y]`.
- SQL migrations define the climate, provenance, hierarchical wine-area,
  parcel, lieu-dit, and MVT contracts.
- Python tooling downloads and normalizes Météo-France data, imports project
  climate CSVs, and dry-runs or commits wine geodata from fixtures/local files.

### Prepared but data-dependent

- Real climate display requires populated `region_vintage_climate` rows. The
  weekly mode additionally needs those rows re-exported and re-imported after
  migration 0008 so their `weekly` rollup is filled.
- Real geographic overlays require populated PostGIS geodata tables plus the
  MVT migration and server-side Supabase configuration.
- Detailed coverage is intentionally uneven: Alsace and Champagne are the first
  geodata targets; Bourgogne's structure exists but its full import is deferred.

### Not yet complete

- A production-grade, scheduled computation/backfill pipeline for real climate
  indicators.
- Complete sourced geometry and fine-grained soil/climate coverage across all
  twelve regions.
- Comparisons beyond two vintages in the same region.
