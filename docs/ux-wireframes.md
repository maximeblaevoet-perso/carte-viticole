# UX wireframes

## Desktop — main screen

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Header : projet · recherche region · selection millesime                      │
├───────────────────────────────────────────────┬──────────────────────────────┤
│ Carte viticole                                │ Panneau region                │
│ (MapLibre, 3 regions cliquables)              │ - Region selectionnee         │
│                                               │ - Profil du millesime + badge │
│                                               │ - Indicateurs cles            │
│                                               │ - Climat mensuel (chart)      │
│                                               │ - Timeline annees             │
│                                               │ - Boutons Detail / Comparer   │
└───────────────────────────────────────────────┴──────────────────────────────┘
```

The panel is the right-side `aside` (`w-[380px]`), hidden below `md`.

## Mobile — main screen

- Map full screen.
- Tap a region → bottom sheet appears with the summary (peek state ~42%).
- Swipe up / tap the handle → expanded state (~85%) for detail.
- The bottom sheet reuses the exact same content component as the desktop panel.

## Vintage fiche (`/regions/[region]/vintage/[year]`)

```
← Retour a la carte
Region YYYY                                  [badge source] [Comparer]
┌ Resume automatique ─────────────────────────────────────────────┐
│ summary + flag chips                                            │
└─────────────────────────────────────────────────────────────────┘
[ Climat | Sols | Notes | Sources | Methodologie ]
  Climat: indicateurs cles + chart mensuel (temp + pluie)
  Sols:   liste des sols (type, part %, source)
  Notes:  table generique vintage_scores
  Sources / Methodologie: provenance + definitions
```

## Comparison (`/compare?region=&a=&b=`)

- Region select + two year selects.
- A difference table for the headline indicators (A, B, écart).
- Two cards side by side (flags + monthly chart + summary) for A and B.

## Component map

| Concern            | Component                                  |
| ------------------ | ------------------------------------------ |
| Map                | `components/map/WineMap.tsx`               |
| Shell + state      | `components/ExplorerApp.tsx`               |
| Header             | `components/Header.tsx`                     |
| Panel / sheet body | `components/panel/RegionPanelContent.tsx`  |
| Bottom sheet       | `components/panel/BottomSheet.tsx`          |
| Timeline           | `components/VintageTimeline.tsx`            |
| Indicators grid    | `components/KeyIndicators.tsx`              |
| Flags              | `components/FlagChips.tsx`                  |
| Source badge       | `components/SourceBadge.tsx`                |
| Monthly chart      | `components/charts/MonthlyClimateChart.tsx` |
| Fiche              | `components/vintage/VintageDetail.tsx`      |
| Comparison         | `components/compare/CompareView.tsx`        |
