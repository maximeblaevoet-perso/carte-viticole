# UX wireframes

## Desktop — main screen

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Header : projet · recherche de lieux (ADR 0023) · selection millesime         │
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

**Search (ADR 0023).** The header search finds a région, sous-région,
appellation, village, premier / grand cru, lieu-dit, commune or domaine
(accent- and case-insensitive, local index, no request per keystroke). Each
result shows a coloured type chip plus its context (parent area or commune ·
region). Picking one selects it like a click and frames its whole extent at a
zoom where its layer is drawn. A click on the map frames the clicked place the
same way when its extent is known, but never zooms out.

**Alsace, planted vines (ADR 0016).** From zoom 13 the map shows the vines
actually planted, coloured by terroir score; a bottom-left control switches
the colouring (score soleil / fraîcheur, géologie, pente, exposition,
altitude) and shows its legend. The géologie legend groups rock families
the way wine talks about soils (calcaires et craies, marnes et argiles,
sables et grès, granites, métamorphiques, volcaniques, then formations
superficielles), one hue per group, light → dark inside (ADR 0020). The exposition legend is a
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

**Cru boundary over the parcellaire (ADR 0018, 0022).** From zoom 13 the
cru fill fades to a faint wash and its boundary is redrawn above parcels,
lieux-dits and vines on a light casing, on every basemap, so the cru stays
readable without hiding the plots. Premiers crus are gold, grands crus brick
orange, in every region.

**Progressive reading (ADR 0022).** One level is read at a time, the previous
one fading to a faint wash but never disappearing: région (≤ 7.5) → secteurs
(7–10.3) → villages / appellations (9.6–12.8) → crus (≥ 10.8) → vines and
lieux-dits (≥ 13). Each zone has its own pastel (touching neighbours differ)
and a single name at its centre; once a level is no longer the one being
read, its outline stays above the vines, turns a neutral brown (a coloured
parent around differently coloured children clashed) and its name runs along
the outline in the same brown; parents differ by line width and name size.
Only the level right above the one being read keeps its outline (région while
reading secteurs, secteur while reading villages, village while reading crus
and vines). Cru labels show the short name plus a small "1ER CRU" /
"GRAND CRU" line; a lieu-dit label is smaller, grey, and hidden when it only
repeats its cru's name.

## Mobile — main screen

- Map full screen: no top header (ADR 0022). A « Rechercher un lieu » button +
  the vintage select sit in a thin bar at the bottom of the map; the vintage
  timeline is also in the fiche. The button opens a full-screen search (input
  on top, results below, « Annuler ») so the keyboard never hides the list
  (ADR 0023). The chosen place is framed in the part of the map above the
  bottom sheet.
- Tap a region → bottom sheet appears with the summary (peek state ~42%).
- Tap the handle → expanded state (~85%) for detail. ▾ folds the sheet to a
  one-line bar (selection name, tap to reopen) so the map and its controls
  are free; × closes the fiche and clears the selection. Gesture-driven
  dragging is not implemented yet.
- The vine colouring control folds to one line (folded by default on a phone).
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
| Place search       | `components/SearchBar.tsx`, `lib/search.ts` |
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
