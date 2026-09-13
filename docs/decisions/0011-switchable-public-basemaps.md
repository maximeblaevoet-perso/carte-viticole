# ADR 0011 — Switchable public basemaps (IGN / BRGM) + relief overlay

## Status

Accepted — 2026-09-12

## Context

`WineMap.tsx` hardcoded a single raster basemap from
`basemaps.cartocdn.com/light_all`. CARTO has closed anonymous access: the tiles
still answer `200 OK`, but the image now carries an **"API KEY REQUIRED"**
watermark, visible across the whole map in production. The basemap had to go.

Beyond fixing that, a single fixed basemap is the wrong shape for this product.
Reading a vineyard means switching context: a sober plan to navigate, aerial
imagery to see the plots, and the geological map to explain the soils — which is
the product's own subject (`docs/climate-methodology.md`, soils tab). Slope is
what ties them together, so shaded relief must be combinable with any of them,
not be a fourth exclusive choice.

## Decision

1. **Replace the hardcoded style with a registry**, `src/lib/basemaps.ts`. One
   entry per basemap: tile template builder, attribution, opacity, and a
   `theme` describing how the wine layers repaint over it.
2. **Three basemaps**, all key-free and account-free:
   - `plan` — IGN Plan v2, Géoplateforme WMTS, `PM` matrix set.
   - `aerial` (**default**) — IGN Orthophotos (20 cm/px, France
     métropolitaine, to z19). Imagery is the most legible entry point for a
     vineyard map: plots, woods and slopes are visible without a legend.
   - `geology` — BRGM, layer `GEOLOGIE`. **WMS only**: the BRGM WMTS endpoint
     returns a MapServer error, so this is a MapLibre raster source built with
     the `{bbox-epsg-3857}` placeholder.
3. **No separate relief overlay.** An IGN `estompage` layer was built and then
   removed: IGN Plan v2 already ships its own shading, and stacking a second
   grey layer over imagery and geology only muddied both. Slope reading is left
   to the basemaps themselves.
4. **Geology uses BRGM's scale-adaptive `GEOLOGIE` layer**, not a client-side
   scale switch. The named layers each have a hard server-side scale window and
   return a blank 116-byte PNG outside it — measured on a Burgundy tile:
   `SCAN_F_GEOL250` paints only at z11–z12, `SCAN_D_GEOL50` only from z12. A
   z10 break between them would have shown an empty map at every zoom below 11.
   `GEOLOGIE` composes 1/1 000 000 → 1/250 000 → 1/50 000 server-side: it
   paints at every zoom, and its z15 tile is byte-identical in content to the
   `SCAN_D_GEOL50` tile, so no detail is lost where the 1/50 000 exists.
5. **The wine layers are never rebuilt.** Switching only removes/adds the
   `basemap` raster layer and its source, re-inserted *before* the lowest
   non-basemap layer. The `areas` / `area-points` / `area-labels` GeoJSON
   sources and the `wine` MVT source (ADR 0007) keep their tiles, their
   feature-state (hover / selection) and their zoom bands.
6. **Per-basemap wine-layer theme.** The editorial palette is tuned for a light
   background and disappears over imagery and geology. `applyWineTheme()`
   repaints only outline / label / marker colours:
   - `plan` — unchanged (per-region colours, cream halo);
   - `aerial` — white outlines, white labels on a near-black halo;
   - `geology` — near-black outlines, dark labels on a white halo.
   The original `line-color` / `line-width` are captured on first theming, so
   the per-region palette and the state-driven widths come back on `plan`.
7. **The geology view is read by clicking, not by a legend.** A 1/50 000 sheet
   carries hundreds of formations, so a static legend is not an option, and the
   `GEOLOGIE` raster is not queryable. BRGM exposes exactly one queryable layer
   describing the subsoil nationally — `LITHO_1M_SIMPLIFIEE` — so a click runs a
   WMS `GetFeatureInfo` against it and a card reads out the rock family
   ("Calcaires, marnes et gypse", "Granites"…). Verified on real sites: Gevrey
   and Chablis → calcaires/marnes, Riquewihr → grès, Châteauneuf → argiles.
   The card states the precision gap in plain words: the colours are the
   1/50 000 map, the wording is the 1/1 000 000 lithology.

   Two MapServer constraints shape the request. `INFO_FORMAT` must be
   `text/plain` (`application/json` is rejected). And the query box is a
   **fixed 7168 m** wide, independent of the map zoom: MapServer honours a
   layer's declared scale window, `LITHO_1M_SIMPLIFIEE` declares
   `MinScaleDenominator` 25 000, and a box sized from the map zoom crossed that
   floor around z15 — so clicking a cru at full zoom answered nothing. With a
   256 px box, 7168 m is exactly 1:100 000. Only the request *scale* is pinned;
   the box stays centred on the click, so the point queried is unchanged.
8. **BRGM is loaded lazily.** It has no CDN and is noticeably slow; its source
   only enters the style when the geology view is selected, and leaves when
   another basemap is chosen.
9. **Attribution per source**, carried by the MapLibre `attribution` field:
   "© IGN / Géoplateforme" for plan / aerial / relief, "© BRGM" for geology.

The control is `src/components/map/BasemapSwitcher.tsx`, a small overlay at the
map's top-right (the `NavigationControl` keeps the top-left).

## Consequences

- No key, no account, no quota contract to manage — same operating model as
  before, without the watermark.
- Coverage is **France métropolitaine**: IGN orthophotos and BRGM stop at the
  national border, and the DOM-TOM / neighbouring countries fall back to the
  background colour. Acceptable — the product is the French vineyard.
- Adding a basemap is a registry entry, not a change to `WineMap.tsx`.
- Themes are colour-only. Fill opacities are left alone; if fills prove too
  muddy over geology, the theme gains a fill factor rather than a new code path.
- The subsoil readout is a *family*, not a formation. If finer geology is ever
  needed, it has to come from ingested harmonised data (BRGM 1/50 000
  harmonisé), not from this WMS — nothing finer is queryable there.
- We depend on two public French services. If Géoplateforme rate-limits, the
  registry is the single place to add a fallback.

## Alternatives considered

- **Keep CARTO with an API key** — rejected: an account and a quota for a
  basemap this project does not need to own.
- **OSM raster tiles (tile.openstreetmap.org)** — rejected: the usage policy
  forbids this kind of app-embedded use, and the rendering is busier than Plan
  IGN v2.
- **`map.setStyle()` on switch** — rejected: it tears down and rebuilds every
  source, so the MVT tiles would refetch and hover/selection state would be lost
  on every click of the control.
- **A static geology legend** — rejected: the displayed 1/50 000 map has
  hundreds of formations, and a legend built from the simplified 1/1 000 000
  classes would show colours that do not match what is on screen.
- **Labelling formations directly on the map** — not possible: the basemap is a
  flat image, with no vector features to label.
- **BRGM via WMTS** — not available: the endpoint answers with a MapServer
  error, verified.
- **Client-side `SCAN_D_GEOL50` / `SCAN_F_GEOL250` switch at z10** — rejected
  after measurement: both layers are blank below z11, so the geology view would
  have been empty at the zooms where users arrive. See decision 4.
