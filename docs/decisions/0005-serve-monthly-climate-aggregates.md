# 0005 — Serve monthly climate aggregates to the frontend

- Status: Accepted
- Date: 2026-06-30

## Context

ADR 0002 established `daily_weather` as the source granularity. The frontend,
however, only ever displays region × vintage indicators and **monthly** charts.
Exposing or querying `daily_weather` from the UI would be heavy and unnecessary.

## Decision

- `daily_weather` stays the **source granularity** for reliable computation and
  recomputation. It is an ingestion/computation table.
- The **frontend never reads `daily_weather`.**
- The frontend reads `region_vintage_climate`, including its `monthly` JSONB
  rollup, which powers the **default monthly charts**.
- A thin data-access layer (`src/data/climate.ts`) is the single seam: it
  returns the existing TS types and falls back to the synthetic engine when
  Supabase is not configured (`NEXT_PUBLIC_DATA_SOURCE` ≠ `real` or missing
  credentials), on error, or when a row is absent.
- **`daily_weather` is NOT pushed to Supabase by default.** Because it is huge
  (millions of rows) and unused by the UI, the ingestion script
  (`scripts/import_meteo_france_to_supabase.py`) skips it; it stays a **local**
  computation source used to compute `region_vintage_climate`. It can still be
  pushed explicitly (`--only daily_weather`) if ever (re)hosted in Supabase.
- **Weekly** charts remain deferred (see ADR 0002).

## Consequences

- The UI surface stays small and cheap: pre-computed aggregates only.
- The daily volume was indeed costly to import (≈14M rows), so `daily_weather`
  now lives **outside Supabase** (local CSVs) by default. This is acceptable
  **provided** the aggregates, indicators, `source_type` and `confidence` in
  `region_vintage_climate` are preserved and pushed — the frontend contract does
  not change. Recomputation/backfill can still re-ingest daily on demand.
- Synthetic remains a first-class fallback, keeping the demo runnable with no
  backend.

## Alternatives considered

- Query `daily_weather` and roll up client-side: rejected (heavy payloads,
  duplicates computation already done by the ingestion pipeline, and leaks the
  source granularity into the UI).
