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
- Published QUOT CSV values are already in **°C and mm** (one decimal). The
  official field descriptor says « en °C et 1/10 » for 0.1° precision, not for
  integer tenths requiring a `/10` conversion.

Open-data fetching and normalization live in
`scripts/fetch_meteo_france_open_data.py`.
Project-CSV import into Supabase lives in
`scripts/import_meteo_france_to_supabase.py` (stations, region↔station mapping,
and region×vintage climate, in dependency order).
Adjust the normalization to the exact export you download, then verify the CSV
columns against `supabase/migrations/0002_core_tables.sql` before importing.

### Daily weather: computed locally, not pushed to Supabase

`daily_weather` remains the **source granularity** for reliable computation, but
it is **not pushed to Supabase by default**: the table is very large (millions
of rows) and the frontend never reads it. Daily CSVs are kept locally and used
to derive the monthly and weekly rollups + indicators stored in
`region_vintage_climate`, which is what the UI serves (both chart granularities
included). See ADR 0005 and ADR 0008. The import script skips `daily_weather`
unless explicitly requested (`--only daily_weather`).

### Priority V1 variables

- daily min / max / mean temperature
- daily precipitation
- days > 30 °C, days > 35 °C
- spring frost days
- cumulative rain Apr–Sep, Jul–Aug, September
- longest dry spell

Humidity, wind, sunshine, radiation are modelled in the schema but **not**
prioritised in the V1 UI.

## Wine geodata (target real sources)

Hierarchical map geometry and fine parcels will be ingested from public French
open data. Every row carries `source_type` plus `source_datasets` metadata.
**Never** present informative INAO contours as official boundaries.

| Dataset id | Source | Role |
| ---------- | ------ | ---- |
| `inao-siqo` | [SIQO INAO](https://www.data.gouv.fr/datasets/referentiel-des-produits-sous-signe-officiel-didentification-de-la-qualite-et-de-lorigine-siqo) | Product/appellation referential (CSV, no geom) |
| `inao-aires-produits` | [Aires AOC/AOP/IGP](https://www.data.gouv.fr/datasets/aires-et-produits-aoc-aop-et-igp) | Tabular aires ↔ produits (CSV) |
| `inao-aires-geo` | [Aires géographiques SIQO](https://www.data.gouv.fr/datasets/delimitation-des-aires-geographiques-des-siqo) | Appellation area polygons (`is_informative`). Catalogue **tous produits** : l’ingestion ne garde que `categorie` commençant par « Vin » (`product_is_wine`) — sinon Choucroute / Miel / Volailles d’Alsace arrivent en base (ADR 0012) |
| `inao-parcellaire` | [Parcellaire INAO](https://www.data.gouv.fr/datasets/delimitation-parcellaire-des-aoc-viticoles-de-linao) | Aires délimitées par commune × dénomination → `wine_parcels` (**pas** du cadastre : `name` est l’appellation) |
| `ign-rpg` | [RPG IGN](https://cartes.gouv.fr/aide/fr/partenaires/ign/referentiels-description-territoire/vegetation-agriculture/rpg/) | Declared vine plots — enrichment only |
| `etalab-cadastre` | [Cadastre Etalab](https://cadastre.data.gouv.fr/datasets) | Parcel refs + `wine_lieux_dits` — the only source of **named** fine geometry (Champagne 08/10/51/52, Alsace 67/68) |

### Basemaps (display only, not ingested)

Background imagery is streamed live from public French services — no key, no
account, nothing stored. It is **display context**, never a data source for
indicators, so it carries no `source_type`. Attribution is mandatory and set per
MapLibre source (ADR 0011).

| Service | Layer | Used for | Attribution |
| ------- | ----- | -------- | ----------- |
| IGN Géoplateforme (WMTS) | `ORTHOIMAGERY.ORTHOPHOTOS` | "Aérien" basemap, **default** (20 cm/px, to z19) | © IGN / Géoplateforme |
| IGN Géoplateforme (WMTS) | `GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2` | "Plan" basemap (already shaded) | © IGN / Géoplateforme |
| BRGM (**WMS only**) | `GEOLOGIE` | "Géologie" basemap (scale-adaptive 1/1 M → 1/50 000) | © BRGM |
| BRGM (**WMS only**) | `LITHO_1M_SIMPLIFIEE` | Click-to-read subsoil, all basemaps (`GetFeatureInfo`) | © BRGM |

Coverage is France métropolitaine; outside it these layers are empty. The BRGM
WMTS endpoint returns a MapServer error — WMS with `{bbox-epsg-3857}` is the
only working path. Use the composite `GEOLOGIE` layer, not `SCAN_D_GEOL50` /
`SCAN_F_GEOL250`: those have hard server-side scale windows and return blank
tiles below z11 (ADR 0011).

The geological rasters are **not queryable**. `LITHO_1M_SIMPLIFIEE` is the only
layer on this service that answers `GetFeatureInfo`, and it is a *simplified*
lithology at 1/1 000 000: it names a rock family ("Calcaires, marnes et gypse",
"Granites"…), never the exact formation drawn on the 1/50 000 map. The UI must
keep saying so. `INFO_FORMAT` must be `text/plain` — `application/json` is
rejected by this MapServer instance.

The readout is shown on **every** basemap and worded in plain French, keyed by
`CODE_GEOL` (ADR 0013). The classes observed over France métropolitaine are:
1 Argiles, 2 Calcaires/marnes/gypse, 3 Craie, 5 Grès, 6 Sables, 7
Basaltes/rhyolites, 8 Granites, 9 Ophiolites, 10 Gneiss, 11 Micaschistes, 12
Schistes/grès.

### Soil depth — no usable source yet

There is **no soil depth in the app**, and it is not an oversight.

`EPAISSEUR_ALTERITES` ("Modèle d'épaisseur des Altérites", BRGM `geologie`
service) is the conceptually correct dataset: the thickness of weathered cover
above fresh rock, i.e. how deep you dig before hitting the rock named by
`LITHO_1M_SIMPLIFIEE`. It is unusable here on two counts:

- **Bretagne only.** Declared bbox 47.17–48.99 N / −4.95–−0.87 E; the abstract
  scopes it to départements 22, 29, 35, 56 — no vineyard in this project.
- **No value returned.** Inside Bretagne, `GetFeatureInfo` answers with an empty
  feature (bounding box, no attribute): it is an unattributed raster.

No other queryable layer on the BRGM service carries a depth. BSS boreholes
(`BSS_TOTAL_*`) expose `prof_atteinte`, but they are sparse water/geotechnical
drillings, the field is frequently empty, and a borehole's total depth is not
the soil depth over a plot.

#### Candidate kept for later: ISRIC SoilGrids

Not integrated — recorded so the option does not have to be rediscovered.

SoilGrids v2.0 (ISRIC, CC-BY 4.0) is a global soil-property model with a
key-free REST API. Point query, no registration:

```
https://rest.isric.org/soilgrids/v2.0/properties/query?lon=7.29&lat=48.20&property=clay&property=sand&depth=0-30cm&value=mean
```

`.../properties/layers` lists what is available. It answered over the Alsatian
vineyard (Ribeauvillé: 24.4 % clay, 34.7 % sand at 30–60 cm). Values come back
in mapped units with a `d_factor` to divide by (clay/sand `g/kg` ÷ 10 → %), and
`mean` can be `null` where a depth slice is masked.

**Granularity — the deciding question.** SoilGrids is a **250 m raster**, so one
pixel is 6.25 ha. An Alsace grand cru runs roughly 3–80 ha, so most crus get
between one and a dozen pixels: enough to attach *a* texture to a cru, not
enough to resolve variation *within* one. It is also a global machine-learning
prediction from a worldwide profile database, not a French field survey — it
will not reproduce the soil boundaries that define a climat.

Verdict: usable as an indicative "terre argilo-sableuse" label at cru level;
not a substitute for a soil map, and it answers texture, never depth to rock.
For finer French data the route would be the Référentiel Régional Pédologique /
DoneSol (INRAE, 1/250 000), which is not served as a key-free public API.

### Regional scope (initial)

- **Alsace:** L1 region + sous-appellations (ex. Côtes de Barr) + 51 Grands
  Crus. Source `inao-aires-geo` is a **product** catalogue: Crémant d’Alsace and
  the AOC named “Alsace” duplicate the regional footprint and are ingested with
  `map_visible=false`. Named GC polygons in aires-geo are often clones of the
  parent envelope — ingest replaces them with dissolved `inao-parcellaire`
  unions (ADR 0010). The level-2 “Alsace Grand Cru” node is the dissolved union
  of the named crus, not the INAO parent envelope (which covers the whole
  vineyard) — ADR 0012. Named lieux-dits come from `etalab-cadastre` 67/68,
  clipped to the delimited vineyard (~6 000 rows kept out of ~150 000) and
  attached to the grand cru that contains them, never by guesswork.
- **Champagne:** Grand Cru / Premier Cru = **communes** in `wine_areas`; fine
  display uses `wine_parcels` + `wine_lieux_dits` (cadastre), not nested hierarchy.
- **Bourgogne:** schema ready (climats, 1ers crus); full import deferred.

### V1 status (geodata)

Seed contours in `src/data/geo.ts` remain `source_type = synthetic` /
`provisional`. Migration `0005_wine_geodata.sql` creates tables; live Supabase
already holds Alsace/Champagne geometry when ingested. Frontend reads via
`src/data/wine-geodata.ts` with seed fallback until real rows exist.

Raw files live under `data/raw/wine-geodata/` (typically gitignored) — see
`scripts/wine_geodata_download.py` and `scripts/README.md`.

Ingestion script: `scripts/ingest_wine_geodata.py` (dry-run on fixtures or
local raw files; `--commit` for Supabase write).
## External scores

The `vintage_scores` table is a **generic** container. V1 does not integrate any
protected/proprietary critic. Do **not** scrape Parker or any protected
wine-review content. Manually entered scores must use `source_type = 'manual'`.
