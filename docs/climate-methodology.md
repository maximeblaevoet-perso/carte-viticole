# Climate methodology

Indicator definitions. These are **climate facts** computed from **daily** data.
The canonical implementation is `src/lib/indicators.ts` and
`src/data/synthetic.ts` (synthetic) — real data must use the same definitions.

## Source granularity

- Source = **daily** observations (Tmin, Tmax, Tmean, precip).
- Monthly aggregates are a rollup of daily data, used for the **default charts**.
- Weekly aggregates are a second rollup of the same daily data, available behind
  a chart toggle (ADR 0008).

Both rollups aggregate the same way: `t_mean_c` is the **mean** of daily means,
`t_max_c` / `t_min_c` are the **true extremes** of daily TX / TN over the bin
(not the mean of daily maxes/mins), and precipitation is **summed**. A bin with
no observation stores `null`, never `0`, so a gap is never read as a dry, cold
week.

## Weekly bins

Weeks are **fixed 7-day bins anchored on 1 January**: week `w` covers
days-of-year 7(w−1)+1 … 7w, giving 53 bins where the last one holds the
remaining 1–2 days (including the leap day). Each bin records `start_date`,
`end_date` and `days` (the number of days actually observed).

These are deliberately **not ISO 8601 weeks**. ISO weeks drift across the year
boundary, which produces partial bins and misaligns two vintages plotted on the
same axis; fixed bins always cover the same days-of-year, so a week-by-week
comparison of two years is meaningful. The trade-off is the short week 53, made
explicit by `days`.

Canonical implementations: `rollupWeekly` in `src/data/synthetic.ts` and
`build_weekly` in `scripts/fetch_meteo_france_open_data.py`. Both must stay in
sync.

Indicator definitions below are unchanged by the weekly rollup: **indicators are
always computed from daily data**, never from a rollup.

## Seasons

- Growing season (temperature mean, rainfall cumul): **April–September**.
- GDD and heat-day counts: **April–October**.
- Spring frost window: **April–May**.

## Headline indicators

| Indicator                 | Definition                                                |
| ------------------------- | --------------------------------------------------------- |
| `growingSeasonTempC`      | Mean of daily mean temperature, Apr–Sep (°C).             |
| `gdd`                     | Σ max(0, Tmean − 10 °C) over Apr–Oct.                     |
| `daysAbove30`             | Count of days with Tmax > 30 °C (Apr–Oct).                |
| `daysAbove35`             | Count of days with Tmax > 35 °C (Apr–Oct).                |
| `springFrostDays`         | Count of days with Tmin < 0 °C (Apr–May).                 |
| `rainAprSepMm`            | Σ daily precip, Apr–Sep (mm).                             |
| `rainJulAugMm`            | Σ daily precip, Jul–Aug (mm).                             |
| `rainSepMm`               | Σ daily precip, September (mm).                           |
| `longestDrySpellDays`     | Longest run of days with precip < 1 mm in the season.     |
| `waterStressIndex`        | Synthetic 0–100 composite (heat + low summer rain + dry). |
| `harvestRainRiskIndex`    | Synthetic 0–100 composite (Sep rain amount + rainy days). |

The two indices are deliberately simple composites for V1; they are flagged as
synthetic-derived and should be revisited with agronomic input.

## Profile flags

Flags are **region-relative** where it matters: "solaire" / "frais" / "sec" /
"pluvieux" compare a vintage to its own region's median (more meaningful than a
single national threshold). Risk flags use absolute thresholds.

Thresholds live in `THRESHOLDS` in `src/lib/indicators.ts`:

- solaire / frais: growing-season temp ≥ / ≤ region median ± 0.6 °C
- sec / pluvieux: rain Apr–Sep ≤ 0.85× / ≥ 1.15× region median
- stress hydrique: `waterStressIndex` ≥ 60
- risque pluie vendanges: `rainSepMm` ≥ 80 mm
- gel de printemps: `springFrostDays` ≥ 3
- forte chaleur: `daysAbove35` ≥ 4 or `daysAbove30` ≥ 18

## Confidence

Every computed row carries a `confidence` in [0, 1]. Synthetic V1 data uses 0.4.
Real, well-covered region × vintage computations should score higher; sparse
station coverage should lower it.

## Changing this methodology

If you change a definition or threshold, update this file, `src/lib/indicators.ts`,
the Python computation, and add an ADR if the change is structural.
