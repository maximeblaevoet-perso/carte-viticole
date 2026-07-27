# 0008 — Add a weekly climate rollup next to the monthly one

- Status: Accepted
- Date: 2026-07-27

## Context

ADR 0002 made `daily_weather` the source granularity and ADR 0005 established
that the frontend only reads pre-computed aggregates — in practice the `monthly`
JSONB rollup on `region_vintage_climate`. Both ADRs deferred weekly charts.

Monthly means hide short-lived events that matter for a vintage: a heat spike in
late July, a rainy fortnight before harvest, a frost episode in April. Users
need a finer view without exposing the daily table to the browser (which ADR
0005 rejected on payload and duplication grounds).

## Decision

- Add a **`weekly` JSONB rollup** on `region_vintage_climate` (migration `0008`),
  computed by the same pipeline and from the same daily source as `monthly`.
  Daily remains the source granularity and stays out of the UI.
- Weeks are **fixed 7-day bins anchored on 1 January**: week `w` covers
  days-of-year 7(w−1)+1 … 7w, and week 53 holds the remaining 1–2 days
  (including the leap day). These are **not ISO 8601 weeks**.
- Each bin carries `start_date`, `end_date` and `days` (observed-day count), and
  its temperature/precipitation values are `null` — never `0` — when the bin has
  no observation.
- **Monthly stays the default** everywhere. Weekly is an explicit user choice via
  a toggle on the chart, and the toggle is **disabled** when the record's
  `weekly` array is empty.
- Weekly and monthly ship on the **same row**, so switching granularity costs no
  extra request.

## Why fixed bins rather than ISO weeks

ISO weeks drift across the year boundary: days 1–3 January can belong to week 52
or 53 of the previous ISO year, producing partial bins at both ends and shifting
the alignment between two vintages. The comparison view puts two years on the
same axis, so bins that always cover the same days-of-year are the correct
trade-off. The cost is a short week 53, which `days` makes explicit.

## Consequences

- Payload grows by ~53 objects per region × vintage row (a few kB), still far
  below the daily volume ADR 0005 rejected.
- Weekly is opt-in and degrades cleanly: rows written before this migration keep
  an empty array and simply do not offer the mode. No fabricated weeks are ever
  derived from monthly means.
- Real data must be re-exported and re-imported
  (`fetch_meteo_france_open_data.py` → `import_meteo_france_to_supabase.py`) to
  populate `weekly`; the synthetic engine produces it immediately.
- Any future granularity (decades, phenological windows) should follow the same
  shape: a pre-computed rollup on the same row plus a UI toggle.

## Alternatives considered

- **Aggregate weekly client-side from monthly**: impossible — the information is
  not in the monthly means.
- **Query `daily_weather` and roll up in the browser**: rejected again for the
  reasons in ADR 0005 (payload size, duplicated computation, source granularity
  leaking into the UI).
- **A separate `region_vintage_weekly` table**: rejected as over-engineering for
  ~53 rows per vintage; it would add a join or a second request for no benefit,
  while the JSONB column mirrors the proven `monthly` contract.
