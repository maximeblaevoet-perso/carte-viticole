# AGENTS.md

Guide for future AI agents (and humans) working on this repository. Read this
before changing anything. When you change the data model, UX, or methodology,
update the relevant `docs/` files and add an ADR.

## 1. Product objective

A web app to **explore French wine vintages through climate**, region by region.
It helps a user understand a vintage's climate profile: solaire (sunny/warm),
frais (cool), pluvieux (wet), sec (dry), probable water stress, harvest-rain
risk, spring frost, and heat episodes.

It connects: wine region + vintage + historical weather + soil type + optional
external scores + a readable interpretation. It is an **analysis tool**, not just
a map.

Product principles, in order: **climate facts first**, interpretation second,
**source transparency always**, synthetic data must be explicit.

## 2. Tech stack

- Next.js (App Router) + TypeScript
- Tailwind CSS
- MapLibre GL (interactive map)
- Recharts (monthly charts)
- Supabase (PostgreSQL + PostGIS) — target backend
- Python for ingestion/computation scripts

V1 runs the frontend on **synthetic data generated in TypeScript** so it works
with no database. Supabase/PostGIS is the target for real data.

Do not change the stack without adding a decision in `docs/decisions/`.

## 3. Architecture rules

- App Router under `src/app`. Reusable UI in `src/components`.
- Pure domain logic in `src/lib` (`types.ts`, `indicators.ts`, `format.ts`).
- Demo/synthetic data + region metadata in `src/data`.
- SQL migrations in `supabase/migrations` (numbered, append-only).
- Python scripts in `scripts`.
- Keep it simple. Do not over-architecture. Prefer pure, testable functions.
- The TypeScript types in `src/lib/types.ts` mirror the SQL model. Keep them in
  sync; update both together.

## 4. UX rules

- The **map is the entry point**.
- **Desktop = right-side panel**; **mobile = bottom sheet** (peek + swipe up).
- A **vintage timeline** selects the year.
- **Default charts are monthly.** Daily data is for computation, not default
  display. Weekly charts come later.
- Comparison starts with **two vintages in the same region**.
- The vintage fiche has tabs: Climat, Sols, Notes, Sources, Methodologie.

## 5. Data rules

- **Daily weather is the source granularity** for V1.
- Region × vintage indicators are **computed** from (station) daily data.
- Every computed indicator carries a `source_type` and a `confidence` score.
- Monthly aggregates are a rollup of daily data, stored for fast display.
- Never remove source/provenance fields.

## 6. Real vs synthetic vs manual

`source_type` is an enum used everywhere:

| value       | meaning                                                       |
| ----------- | ------------------------------------------------------------- |
| `synthetic` | generated/demo data. MUST be visibly labelled. Never as real. |
| `real`      | observed/ingested data (e.g. Météo-France).                   |
| `manual`    | human-entered values (e.g. a manually noted external score).  |

Never silently mix `synthetic` with `real`. The DB upsert guard and the UI
badges exist to enforce this. All current V1 climate data is `synthetic`.

## 7. Naming conventions

- Region ids are lowercase slugs: `bordeaux`, `bourgogne`, `rhone`.
- TypeScript: `camelCase` fields, `PascalCase` types/components.
- SQL: `snake_case` tables and columns; tables are plural.
- Migrations: `NNNN_short_description.sql`, zero-padded, append-only.
- ADRs: `docs/decisions/NNNN-kebab-title.md`.

## 8. Useful commands

```bash
npm install         # install dependencies (run this first)
npm run dev         # start the dev server (http://localhost:3000)
npm run build       # production build
npm run typecheck   # tsc --noEmit
npm run lint        # next lint

# Python ingestion (see scripts/README.md)
python scripts/import_meteo_france.py --csv FILE --station ID            # dry-run
python scripts/import_meteo_france.py --csv FILE --station ID --commit   # write
```

## 9. Files to read before modifying

- `docs/product-spec.md` — scope and features
- `docs/ux-wireframes.md` — layout and interaction
- `docs/data-sources.md` — where data comes from, Météo-France notes
- `docs/data-model.md` — tables and TS types
- `docs/climate-methodology.md` — indicator definitions
- `docs/architecture.md` — how the pieces fit
- `docs/decisions/` — ADRs (the "why")

Key code: `src/lib/types.ts`, `src/lib/indicators.ts`, `src/data/synthetic.ts`,
`supabase/migrations/`.

## 10. Do NOT

- Do not invent weather data without marking it `synthetic`.
- Do not launch potentially high token operations if something / the terminal seems broken, instead pause and ask me if I can help 
- Do not change the stack without an ADR in `docs/decisions/`.
- Do not replace real weather data with invented data.
- Do not remove source/provenance fields.
- Update the documentation whenever the data model, UX, or methodology changes.
