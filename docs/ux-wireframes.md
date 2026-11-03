# UX wireframes

## Desktop — main screen

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Header : projet · recherche region · selection millesime                      │
├───────────────────────────────────────────────┬──────────────────────────────┤
│ Carte viticole                                │ Panneau region                │
│ (MapLibre, 12 regions + niveaux disponibles)  │ - Aire selectionnee           │
│                                               │ - Profil du millesime + badge │
│                                               │ - Indicateurs cles            │
│                                               │ - Temperatures & pluie (chart │
│                                               │   + toggle Mensuel / Hebdo)   │
│                                               │ - Timeline annees             │
│                                               │ - Boutons Detail / Comparer   │
└───────────────────────────────────────────────┴──────────────────────────────┘
```

The panel is the right-side `aside` (`w-[380px]`), hidden below `md`.

The synthetic region layer is always present. In real-enabled mode, sourced
PostGIS areas, parcels, and lieux-dits are progressively revealed by zoom. A
click selects the geographic feature, recentres the map when appropriate, and
shows its provenance. Climate remains attached to the root region until finer
observations exist.

**Alsace, planted vines (ADR 0016).** From zoom 13 the map shows the vines
actually planted, coloured by terroir score; a bottom-left control switches
the colouring (score soleil / fraîcheur, géologie, pente, exposition,
altitude) and shows its legend. The exposition legend is a
compass rose (8 sectors, flat slopes in the centre) whose colours follow the
sun reading of the score: warm at S/SE, cool at N. Lieux-dits keep their outline
and name but no fill. Clicking a vine opens its card (place, terrain, score
with per-criterion bars and a soleil / fraîcheur toggle, and the reference
domains that declare its grand cru or lieu-dit). Domain cellars are markers
(colour = score); clicking one — or a row of the "Domaines de référence"
ranking in the Alsace region panel — opens the domain card (composition bar
and list, soleil / fraîcheur toggle) and outlines **only the declared grands
crus and lieux-dits**, dashed pink, labelled "name · ≈ n ha". Declared places
outside the view become chips at the top left ("Rangen · 33 km ↓") that fly to
them. No plot is outlined as the domain's (ADR 0019).

**Grand cru boundary over the parcellaire (ADR 0018).** From zoom 13 the
grand cru fill fades to a faint wash and its boundary is redrawn above
parcels, lieux-dits and vines as a red line on a light casing, on every
basemap, so the cru stays readable without hiding the plots.

## Mobile — main screen

- Map full screen.
- Tap a region → bottom sheet appears with the summary (peek state ~42%).
- Tap the handle → expanded state (~85%) for detail. The component copy calls
  this a two-snap bottom sheet; gesture-driven dragging is not implemented yet.
- The bottom sheet reuses the exact same content component as the desktop panel.

## Vintage fiche (`/regions/[region]/vintage/[year]`)

```
← Retour a la carte
Region YYYY                                  [badge source] [Comparer]
┌ Resume automatique ─────────────────────────────────────────────┐
│ summary + flag chips                                            │
└─────────────────────────────────────────────────────────────────┘
[ Climat | Sols | Notes | Sources | Methodologie ]
  Climat: indicateurs cles + chart temp + pluie (Mensuel / Hebdo)
  Sols:   liste des sols (type, part %, source)
  Notes:  table generique vintage_scores
  Sources / Methodologie: provenance + definitions
```

## Chart granularity

Every temperature/rainfall chart carries a segmented **Mensuel / Hebdo** control
in its top-right corner. Monthly is always the initial state (AGENTS.md §4).
Weekly reads the pre-computed 53-bin rollup and relabels the X axis `S1…S53`
(one tick in four), with the covered date range in the tooltip. The Hebdo option
is **disabled**, with a "Données hebdomadaires indisponibles" hint, when the
record has no weekly rollup — in the comparison view, when either vintage lacks
it. Weeks are never derived from monthly means. See ADR 0008.

## Comparison (`/compare?region=&a=&b=`)

- Region select + two year selects.
- A difference table for the headline indicators (A, B, écart).
- A temperature chart and a rainfall chart, each overlaying both vintages, with
  their own series toggles and granularity control.
- Two cards side by side (flags + summary) for A and B.

## Component map

| Concern            | Component                                  |
| ------------------ | ------------------------------------------ |
| Map                | `components/map/WineMap.tsx`               |
| Shell + state      | `components/ExplorerApp.tsx`               |
| Header             | `components/Header.tsx`                     |
| Panel / sheet body | `components/panel/RegionPanelContent.tsx`  |
| Bottom sheet       | `components/panel/BottomSheet.tsx`          |
| Geodata provenance | `components/panel/GeoProvenanceCard.tsx`    |
| Timeline           | `components/VintageTimeline.tsx`            |
| Indicators grid    | `components/KeyIndicators.tsx`              |
| Flags              | `components/FlagChips.tsx`                  |
| Source badge       | `components/SourceBadge.tsx`                |
| Climate chart      | `components/charts/ClimateChart.tsx`        |
| Fiche              | `components/vintage/VintageDetail.tsx`      |
| Comparison         | `components/compare/CompareView.tsx`        |
