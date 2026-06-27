# 0001 — Use Next.js + Supabase + PostGIS

- Status: Accepted
- Date: 2026-06-21

## Context

We need a web app that is map-first, server-renderable, easy to deploy, and able
to store and query geospatial data (region footprints, station locations) plus
time-series weather.

## Decision

- **Next.js + TypeScript + Tailwind** for the app (App Router).
- **Supabase (PostgreSQL + PostGIS)** as the backend/database.
- **MapLibre GL** for the interactive map (no API key required for the V1 OSM
  raster basemap).
- **Recharts** for charts.
- **Python** for ingestion/computation scripts.

## Consequences

- One stack, TypeScript end-to-end on the app side; SQL + Python for data.
- PostGIS gives us spatial types and indexes for regions/stations.
- V1 runs on synthetic, in-memory data so the UI works with no DB; Supabase is
  introduced when real data lands.
- Changing any of these requires a new ADR (see `AGENTS.md`).

## Alternatives considered

- Leaflet instead of MapLibre: viable, but MapLibre's vector/feature-state model
  fits the highlight-on-select interaction better.
- A plain Node/Express API: more boilerplate than Next.js route handlers/Supabase.
