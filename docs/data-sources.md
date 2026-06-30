# Data sources

## Provenance model

Every value that could be observed, generated, or hand-entered carries a
`source_type`:

- `synthetic` — generated demo data. Always visibly labelled. Never shown as real.
- `real` — observed data ingested from an external provider (Météo-France).
- `manual` — human-entered values.

Never mix `synthetic` and `real` silently. See `AGENTS.md` §6.

## V1 status

All climate series currently displayed are **synthetic**, generated
deterministically in `src/data/synthetic.ts` (seeded by `regionId:year`). They
demonstrate the pipeline but are not real observations. Confidence is set low
(0.4) on purpose.

## Météo-France (target real source)

Intended source for real daily weather: Météo-France public climatological data
("données climatologiques de base – quotidiennes").

- Granularity: **daily** (the V1 source granularity).
- Typical columns: `NUM_POSTE`, `AAAAMMJJ`, `TX`, `TN`, `TM`, `RR`, plus optional
  `UM` (humidity), `FFM` (wind), `INST` (sunshine), `GLOT` (radiation).
- Files are semicolon-separated.

Open-data fetching and normalization live in
`scripts/fetch_meteo_france_open_data.py`.
Project-CSV import into Supabase lives in
`scripts/import_meteo_france_to_supabase.py` (stations, region↔station mapping,
daily weather, and region×vintage climate, in dependency order).
Adjust the normalization to the exact export you download, then verify the CSV
columns against `supabase/migrations/0002_core_tables.sql` before importing.

### Priority V1 variables

- daily min / max / mean temperature
- daily precipitation
- days > 30 °C, days > 35 °C
- spring frost days
- cumulative rain Apr–Sep, Jul–Aug, September
- longest dry spell

Humidity, wind, sunshine, radiation are modelled in the schema but **not**
prioritised in the V1 UI.

## External scores

The `vintage_scores` table is a **generic** container. V1 does not integrate any
protected/proprietary critic. Do **not** scrape Parker or any protected
wine-review content. Manually entered scores must use `source_type = 'manual'`.
