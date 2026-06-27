# 0002 — Use daily weather as the source granularity

- Status: Accepted
- Date: 2026-06-21

## Context

The product's indicators (days > 30 °C, days > 35 °C, spring frost days, longest
dry spell, cumulative rain windows) cannot be derived faithfully from monthly
data. They require day-level observations.

## Decision

- **Daily** weather is the source granularity for V1 (`daily_weather`, one row
  per station per day).
- Indicators in `region_vintage_climate` are **computed from daily data**.
- **Monthly aggregates** are a rollup of daily data and are the **default chart**
  granularity in the UI.
- Weekly charts are deferred to a later milestone.

## Consequences

- The synthetic engine generates a full daily series, then rolls up to monthly
  and computes indicators — mirroring the real pipeline shape.
- Storage is larger (daily rows), but indicator fidelity is correct.
- The ingestion script targets daily CSV exports from Météo-France.

## Alternatives considered

- Monthly-only ingestion: simpler/smaller, but makes the headline indicators
  impossible to compute correctly. Rejected.
