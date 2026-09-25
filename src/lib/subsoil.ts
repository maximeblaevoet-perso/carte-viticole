/**
 * The one answer the subsoil card renders — and which of the two BRGM maps it
 * came from (ADR 0014).
 *
 * Two sources, deliberately never merged into one shape:
 *
 * | | `50k` | `1M` |
 * |---|---|---|
 * | source | BD Charm-50, ingested in `geology_units` | `LITHO_1M_SIMPLIFIEE` WMS |
 * | answers | the exact formation and its age | a rock family |
 * | trust at cru scale | yes | **no** (see `geology-info.ts`) |
 *
 * `/api/geology` prefers `50k` and falls back to `1M` outside the ingested
 * départements. The discriminant travels all the way to the UI so the card can
 * state which map answered: a reader must never have to guess whether
 * "Sous-sol de calcaire" was drawn at 1/50 000 or at 1/1 000 000.
 */

import type { FormationInfo } from "@/lib/geology-formation";
import type { GeologyInfo } from "@/lib/geology-info";

export type SubsoilScale = "50k" | "1M";

export type SubsoilAnswer =
  | { scale: "50k"; formation: FormationInfo }
  | { scale: "1M"; info: GeologyInfo };

/** Shape of `GET /api/geology`. `answer: null` means "no data at this point". */
export interface SubsoilResponse {
  answer: SubsoilAnswer | null;
}

/** Narrow an unknown payload (the route is a network boundary). */
export function parseSubsoilResponse(payload: unknown): SubsoilAnswer | null {
  if (!payload || typeof payload !== "object") return null;
  const answer = (payload as { answer?: unknown }).answer;
  if (!answer || typeof answer !== "object") return null;

  const scale = (answer as { scale?: unknown }).scale;
  if (scale === "50k") {
    const formation = (answer as { formation?: unknown }).formation;
    if (!formation || typeof formation !== "object") return null;
    const descr = (formation as { descr?: unknown }).descr;
    if (typeof descr !== "string" || !descr) return null;
    return { scale: "50k", formation: formation as FormationInfo };
  }
  if (scale === "1M") {
    const info = (answer as { info?: unknown }).info;
    if (!info || typeof info !== "object") return null;
    const descr = (info as { descr?: unknown }).descr;
    if (typeof descr !== "string" || !descr) return null;
    return { scale: "1M", info: info as GeologyInfo };
  }
  return null;
}
