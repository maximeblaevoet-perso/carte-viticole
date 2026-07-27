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
