# 0003 — Side panel on desktop, bottom sheet on mobile

- Status: Accepted
- Date: 2026-06-21

## Context

The map is the entry point, but users also need region/vintage detail visible at
the same time. We need a layout that keeps the map prominent while exposing the
profile, indicators, charts, and timeline.

## Decision

- **Desktop**: a fixed **right-side panel** (`aside`, ~380px) beside the map,
  always showing the selected region × vintage.
- **Mobile**: a **bottom sheet** with two snap points — a peek (summary) and an
  expanded state (swipe up / tap handle) for detail.
- Both reuse a single content component (`RegionPanelContent`) so behaviour and
  data stay identical across form factors.

## Consequences

- The map stays the focal point on all screen sizes.
- One content component to maintain, two presentations.
- The panel/sheet is empty-state aware (prompts to pick a region).

## Alternatives considered

- Modal dialog over the map: hides the map and breaks the "map as context" idea.
- Separate detail page only (no panel): too many round-trips for quick scanning.
