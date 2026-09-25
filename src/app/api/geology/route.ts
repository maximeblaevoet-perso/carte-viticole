/**
 * `GET /api/geology?lon=&lat=` — what is under one clicked point (ADR 0014).
 *
 * Answers from **BD Charm-50 at 1/50 000** (`geology_units`, migration 0012)
 * whenever the point falls inside an ingested département, and falls back to
 * BRGM's national `LITHO_1M_SIMPLIFIEE` WMS otherwise. The response always
 * carries which of the two answered — the two scales are not interchangeable
 * (`src/lib/subsoil.ts`).
 *
 * Server-side on purpose, twice over: the Supabase key never reaches the
 * browser, and the BRGM WMS has no CORS headers worth relying on.
 */

import { NextResponse } from "next/server";

import type { FormationInfo } from "@/lib/geology-formation";
import { geologyInfoUrl, lonLatToMercator, parseGeologyInfo } from "@/lib/geology-info";
import type { SubsoilAnswer } from "@/lib/subsoil";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

/** A click that answers nothing is normal (sea, abroad), not an error. */
function empty(): NextResponse {
  return NextResponse.json({ answer: null });
}

function ok(answer: SubsoilAnswer): NextResponse {
  return NextResponse.json(
    { answer },
    // The subsoil under a point does not change. Cache hard; the cost here is
    // a PostGIS point-in-polygon or a slow BRGM round-trip.
    { headers: { "cache-control": "public, max-age=86400, s-maxage=86400" } }
  );
}

/** BD Charm-50, 1/50 000. Returns null when unconfigured or out of coverage. */
async function fromBdCharm50(
  lon: number,
  lat: number
): Promise<FormationInfo | null> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;

  const endpoint = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/rpc/geology_at_point`;
  let resp: Response;
  try {
    resp = await fetch(endpoint, {
      method: "POST",
      cache: "no-store",
      headers: {
        apikey: SUPABASE_KEY,
        authorization: `Bearer ${SUPABASE_KEY}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ lon, lat }),
    });
  } catch {
    return null;
  }
  if (!resp.ok) return null;

  let rows: unknown;
  try {
    rows = await resp.json();
  } catch {
    return null;
  }
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const row = rows[0] as Record<string, unknown>;
  const descr = typeof row.descr === "string" ? row.descr.trim() : "";
  if (!descr) return null;

  return {
    descr,
    notation: typeof row.notation === "string" ? row.notation : null,
    carte: typeof row.carte === "string" ? row.carte : null,
    department: typeof row.department === "string" ? row.department : null,
  };
}

/** BRGM `LITHO_1M_SIMPLIFIEE`, 1/1 000 000 — national, coarse, last resort. */
async function fromLitho1M(lon: number, lat: number) {
  const [x, y] = lonLatToMercator(lon, lat);
  try {
    const resp = await fetch(geologyInfoUrl(x, y), { cache: "no-store" });
    if (!resp.ok) return null;
    return parseGeologyInfo(await resp.text());
  } catch {
    return null;
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  const params = new URL(request.url).searchParams;
  const lon = Number(params.get("lon"));
  const lat = Number(params.get("lat"));
  if (
    !Number.isFinite(lon) ||
    !Number.isFinite(lat) ||
    Math.abs(lon) > 180 ||
    Math.abs(lat) > 90
  ) {
    return NextResponse.json({ error: "lon/lat required" }, { status: 400 });
  }

  const formation = await fromBdCharm50(lon, lat);
  if (formation) return ok({ scale: "50k", formation });

  const info = await fromLitho1M(lon, lat);
  if (info) return ok({ scale: "1M", info });

  return empty();
}
