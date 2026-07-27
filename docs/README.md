# Documentation guide

This directory describes the product, its user experience, its data contracts,
and the decisions behind the implementation. Start with the document that
matches the change you intend to make.

## Read by task

| If you are changing… | Read first | Then verify |
| --- | --- | --- |
| Product scope or user-visible features | [`product-spec.md`](product-spec.md) | [`ux-wireframes.md`](ux-wireframes.md) and the relevant ADR |
| Layout, navigation, map interactions, or responsive behaviour | [`ux-wireframes.md`](ux-wireframes.md) | [`architecture.md`](architecture.md) and ADR 0003/0004/0007 |
| TypeScript or SQL data shapes | [`data-model.md`](data-model.md) | `src/lib/types.ts` and `supabase/migrations/` |
| Climate indicators, flags, or confidence | [`climate-methodology.md`](climate-methodology.md) | `src/lib/indicators.ts`, the Python computation, and ADR 0002/0005 |
| Weather or geographic provenance | [`data-sources.md`](data-sources.md) | `scripts/README.md` and the ingestion scripts |
| Wine-area levels or map geometry | [`wine-hierarchy.md`](wine-hierarchy.md) | `src/data/areas.ts`, `src/data/geo.ts`, and ADR 0004/0006/0007 |
| Application boundaries or data flow | [`architecture.md`](architecture.md) | the relevant data-access module and ADR |

Read [`../AGENTS.md`](../AGENTS.md) before making any change. It contains the
repository-wide rules, especially the requirements to preserve provenance,
label synthetic data, and keep the TypeScript and SQL models aligned.

## Document roles

- [`product-spec.md`](product-spec.md) defines the user problem, V1 scope, and
  current implementation status.
- [`ux-wireframes.md`](ux-wireframes.md) describes routes, responsive layouts,
  and the component map.
- [`architecture.md`](architecture.md) describes runtime boundaries and the
  synthetic/real fallback paths.
- [`data-model.md`](data-model.md) documents the SQL entities and their
  TypeScript mirrors.
- [`data-sources.md`](data-sources.md) records provenance, source limitations,
  and what is synthetic, real, or manual.
- [`climate-methodology.md`](climate-methodology.md) is the readable definition
  of climate indicators and profile thresholds.
- [`wine-hierarchy.md`](wine-hierarchy.md) explains the non-uniform geographic
  hierarchy and its PostGIS representation.
- [`decisions/`](decisions/) contains append-only architecture decision records
  (ADRs): the reason a durable product, UX, data, or architecture choice exists.

## Sources of truth

Documentation explains intent and contracts; executable files remain canonical
for exact implementation details:

| Concern | Canonical implementation |
| --- | --- |
| Domain types | `src/lib/types.ts` and the append-only SQL migrations |
| Indicator formulas and thresholds | `src/lib/indicators.ts` and `src/data/synthetic.ts` |
| Climate reads and fallback | `src/data/climate.ts` and `src/hooks/useClimate.ts` |
| Wine hierarchy and seed geometry | `src/data/areas.ts` and `src/data/geo.ts` |
| Real geodata delivery | migration `0007` and `/api/tiles/wine/[z]/[x]/[y]` |
| Ingestion commands | `scripts/README.md` and each script's `--help` output |

## Keeping documentation current

When a change affects the data model, UX, or methodology:

1. Update the relevant document in this directory.
2. Add a new ADR when the change introduces or reverses a durable decision.
3. Keep existing ADRs as historical records; factual corrections may be noted
   explicitly when implementation details evolve without changing the decision.
4. Verify paths, commands, environment variables, source labels, and links.

