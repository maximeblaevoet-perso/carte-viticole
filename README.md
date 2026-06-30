# Carte viticole — millesimes & climat

Web app to explore French wine vintages through their **climate**, region by
region: warm/cool/wet/dry profiles, water stress, harvest-rain risk, spring
frost, and heat episodes. The map is the entry point; a side panel (desktop) or
bottom sheet (mobile) shows the selected region × vintage.

> **V1 runs on clearly-labelled synthetic data** generated in TypeScript, so it
> works with no database. Real Météo-France ingestion is prepared (SQL + Python skeleton). 
> See `AGENTS.md` before changing anything.

## Stack

Next.js · TypeScript · Tailwind · MapLibre GL · Recharts · Supabase
(PostgreSQL + PostGIS) · Python (ingestion).

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
```

Other scripts: `npm run build`, `npm run typecheck`, `npm run lint`.

> Note: the map basemap and the Inter web font fetch from the network at runtime
> / build time. The app shell and data work offline; only those assets need access.

## Routes

- `/` — map + region panel (the explorer)
- `/regions/[region]/vintage/[year]` — vintage fiche (tabs: Climat, Sols, Notes,
  Sources, Methodologie)
- `/compare?region=&a=&b=` — compare two vintages in the same region

V1 regions: Bordeaux, Bourgogne, Vallee du Rhone, Alsace, Champagne, Loire, Corse, Provence, Beaujolais, Jura, Savoie, Languedoc-Roussillon. Vintages: 2000–2024.

## Project layout

```
src/app          routes (App Router)
src/components    UI (map, panel, charts, fiche, compare)
src/lib           pure domain logic (types, indicators, format)
src/data          synthetic engine + region metadata/footprints
supabase/migrations  SQL (PostGIS + 7 core tables)
scripts           Python ingestion (Météo-France CSV) skeleton
docs              spec, UX, data model, methodology, ADRs
```

## Database (optional, for real data)

Apply migrations in order (`supabase/migrations/0001…`, `0002…`, `0003…`) to a
PostgreSQL instance with PostGIS, e.g. via the Supabase CLI or `psql`. Then use
`scripts/import_meteo_france_to_supabase.py` to load the real project CSVs.

## Intégrer les données Météo-France

1. Générer les CSV projet avec `scripts/fetch_meteo_france_open_data.py`.
2. Vérifier les fichiers produits, surtout `weather_stations.csv` et
   `region_vintage_climate.csv`.
3. Importer les CSV projet (stations, mapping, quotidien, millésimes) en une
   passe, dans l'ordre des dépendances :
   `scripts/import_meteo_france_to_supabase.py --commit`.
4. L'import charge aussi `region_vintage_climate`; sinon le recalculer après
   les données stationnaires et quotidiennes.
5. Vérifier dans l’UI que les observations réelles apparaissent avec
   `source_type = real`.

### Supabase CLI (local dev, Windows)

Node.js **20+** is required to run the Supabase CLI via `npx`.

Use the commands below (no secrets should be committed):

1. `npx supabase login`
2. `npx supabase init`
3. `npx supabase link --project-ref xdlnoqmuomqgtsfjtria`
4. `npx supabase db push`

## Data integrity rules (short version)

- Synthetic data is always labelled `source_type = 'synthetic'`.
- Never mix synthetic and real data silently.
- See `AGENTS.md` for the full rules.
