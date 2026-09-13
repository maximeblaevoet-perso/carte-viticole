# ADR 0013 — Subsoil readout on every basemap, in plain French, without a depth

## Status

Accepted — 2026-09-13

## Context

ADR 0011 introduced the “Sous-sol” card: click the map, and BRGM answers with
the rock family under that point. It was gated to the geological basemap,
because that is where it was born — the geological raster carries no usable
legend, so clicking was the only way to read it.

That gating turned out to be wrong for the actual question users ask. “What is
my plot sitting on?” is asked just as often while looking at the aerial imagery
(where the plot is recognisable) or the plan (where the village is). The BRGM
query depends only on the clicked coordinates — never on which basemap is
displayed — so the restriction was incidental, not principled.

Two further problems with the card as it stood:

1. **It spoke BRGM, not French.** It printed the raw `DESCR` heading, a
   capitalised plural (“Calcaires, marnes et gypse”), plus the raw class
   (“Roches Sédimentaires”). Accurate, and meaningless to a reader who is not a
   geologist — which is the entire audience of this map.
2. **It gave no sense of depth.** “Sous-sol de gneiss” says nothing about
   whether the gneiss is under 40 cm of soil or under 20 m of alluvium, which
   is precisely what matters to a vine.

## Decision

### 1. The card is shown on all three basemaps

`GeologyReadout` is rendered unconditionally, the click handler no longer
returns early off the geological basemap, and the readout is no longer reset
when the basemap changes — switching from Plan to Géologie now keeps the answer
on screen, which is the natural way to check a reading against the colours.

### 2. The wording is plain French, keyed by `CODE_GEOL`

`plainSubsoil()` (in `src/lib/geology-info.ts`) maps each lithology class to a
ready-made sentence plus a one-line, non-technical gloss:

> **Sous-sol de craie**
> Roche blanche et poreuse : elle stocke l’eau et la rend à la vigne — la Champagne.
> *roche sédimentaire*

The map is keyed by `CODE_GEOL`, not by `DESCR`: the code is the stable id, and
the label is a plural heading that reads badly inside a sentence. Each entry
carries the **whole** “Sous-sol de …” phrase, so elisions (`d’argile`) and
plurals are written once rather than assembled at render time.

The eleven classes covered (codes 1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12) are the
ones actually observed by sweeping `LITHO_1M_SIMPLIFIEE` on a grid over France
métropolitaine. An unknown code falls back to the raw `DESCR`, lowercased.

### 3. No depth is displayed — the data does not exist

The obvious candidate was BRGM’s `EPAISSEUR_ALTERITES` (“Modèle d’épaisseur des
Altérites”). Conceptually it is exactly right: the thickness of weathered cover
(decomposed rock and soil) above fresh rock, i.e. how deep you dig before
hitting the gneiss. It is nevertheless unusable here, for two independent
reasons:

- **Footprint: Bretagne only.** Its declared bounding box is
  47.17–48.99 N / −4.95–−0.87 E, and its own abstract says the model covers
  départements 22, 29, 35 and 56 — not one vineyard in this project.
- **No value is returned.** Even inside Bretagne, `GetFeatureInfo` answers with
  an empty feature (a bounding box and nothing else): the layer is an
  unattributed raster, so there is no number to read.

Every other queryable layer of the BRGM `geologie` service was reviewed.
`LITHO_1M_SIMPLIFIEE` is the only national one describing the subsoil, and it
carries `DESCR` and `TYPE` only. The BSS boreholes carry a depth, but they are
sparse water/geotechnical drillings whose `prof_atteinte` is frequently empty —
a borehole’s total depth is not the soil depth over a vineyard plot anyway.

Rather than invent a plausible number, the card states the limit in its own
footer: *“famille de roche, pas la formation exacte ni sa profondeur”*.

## Consequences

- The subsoil is readable from the imagery, which is how plots are identified.
- The card is understandable without a geology background.
- Soil depth remains an open need. `docs/data-sources.md` records the one
  candidate found so far (ISRIC SoilGrids) and its granularity, for a later
  decision.
