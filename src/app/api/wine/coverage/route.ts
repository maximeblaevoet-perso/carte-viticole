/**
 * Which level-1 regions already have REAL PostGIS contours.
 *
 * The map ships two families of polygons: rough editorial footprints from
 * `src/data/geo.ts` (synthetic, deliberately crude) and real INAO/Cadastre
 * contours streamed as vector tiles. Drawing both for the same region stacks a
 * box-shaped approximation on top of the accurate outline — what the user sees
 * as "un gros rectangle" next to the right shape (ADR 0012).
 *
 * `WineMap` calls this once and filters the synthetic layers to the regions we
 * do NOT cover yet. Reads the `wine_real_coverage` view (migration 0010) with
 * the server-side key; the browser only ever sees a list of region ids.
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

/** Never invent coverage: an unreachable/unconfigured backend means "none". */
function none(): NextResponse {
  return NextResponse.json({ regions: [] as string[] });
}

export async function GET(): Promise<NextResponse> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return none();

  const endpoint =
    `${SUPABASE_URL.replace(/\/$/, "")}` +
    `/rest/v1/wine_real_coverage?select=root_region_id`;

  let resp: Response;
  try {
    resp = await fetch(endpoint, {
      cache: "no-store",
      headers: {
        apikey: SUPABASE_KEY,
        authorization: `Bearer ${SUPABASE_KEY}`,
        accept: "application/json",
      },
    });
  } catch {
    return none();
  }

  if (!resp.ok) return none();

  let rows: unknown;
  try {
    rows = await resp.json();
  } catch {
    return none();
  }
  if (!Array.isArray(rows)) return none();

  const regions = rows
    .map((r) => (r as { root_region_id?: unknown }).root_region_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  return NextResponse.json(
    { regions },
    { headers: { "cache-control": "public, max-age=300, s-maxage=300" } }
  );
}
