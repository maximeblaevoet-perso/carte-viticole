# 0009 — Rollup t_max / t_min as true extremes

- Status: Accepted
- Date: 2026-07-27

## Context

Monthly and weekly climate rollups store `t_max_c` and `t_min_c` next to
`t_mean_c`. The first implementation averaged daily TX and TN over each bin
(climatological “mean of daily maxima/minima”). The chart UI labels those
series “Max” / “Min”, and users expect the hottest and coldest day in the
period — especially for heat spikes and frost episodes that a mean of maxima
smooths away.

## Decision

- In both the monthly and weekly rollups, `t_max_c` is the **maximum** of daily
  TX and `t_min_c` is the **minimum** of daily TN over the bin.
- `t_mean_c` stays the mean of daily means; precipitation stays a sum.
- Keep Python (`build_monthly` / `build_weekly`) and synthetic TypeScript
  (`rollupMonthly` / `rollupWeekly`) in sync.

## Consequences

- Existing `region_vintage_climate` rows must be recomputed (`--transform-only`
  then re-import) for charts to show the new extremes.
- Synthetic demo data regenerates on the fly with the same rule.
- Indicator definitions are unchanged: they still run on daily data.
