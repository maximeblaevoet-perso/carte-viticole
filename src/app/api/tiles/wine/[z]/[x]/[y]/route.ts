/**
 * Vector-tile endpoint for the wine geodata (PostGIS → MapLibre).
 *
 * Proxies the `wine_mvt(z, x, y)` PostGIS function (migration 0007) through
 * Supabase PostgREST and returns a Mapbox Vector Tile. The Supabase key is read
 * server-side and NEVER sent to the browser — the client only ever fetches
 * `/api/tiles/wine/{z}/{x}/{y}`.
 *
 * When Supabase is not configured (no URL/key), the route returns `204 No
 * Content`; MapLibre simply renders empty tiles and the synthetic fallback in
 * `WineMap` stays fully functional. No geometry is ever invented here.
 */

import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
// Server-side only. Prefer the service role (bypasses RLS) but the public anon
// key works too since the geodata tables are readable. Never exposed to client.
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

const MVT_CONTENT_TYPE = "application/vnd.mapbox-vector-tile";

function empty(): Response {
  return new Response(null, { status: 204 });
}

/** PostgREST returns `bytea` RPC results as a JSON string (`"\\x1a2b…"`). */
function decodePostgrestBytea(value: unknown): Uint8Array | null {
  if (typeof value !== "string" || !value.startsWith("\\x")) return null;
  const hex = value.slice(2);
  if (hex.length === 0) return new Uint8Array(0);
  if (hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) return null;
    out[i] = byte;
  }
  return out;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { z: string; x: string; y: string } }
): Promise<Response> {
  const z = Number(params.z);
  const x = Number(params.x);
  // Tolerate an optional file extension (e.g. `.mvt`/`.pbf`) on {y}.
  const y = Number(String(params.y).replace(/\.(mvt|pbf)$/i, ""));

  if (![z, x, y].every(Number.isInteger) || z < 0 || z > 22) return empty();
  if (!SUPABASE_URL || !SUPABASE_KEY) return empty();

  const endpoint = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/rpc/wine_mvt`;

  let resp: Response;
  try {
    resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        authorization: `Bearer ${SUPABASE_KEY}`,
        "content-type": "application/json",
        // PostgREST exposes bytea RPC results as a JSON hex string, not as
        // application/octet-stream (PGRST107 if requested).
        accept: "application/json",
      },
      body: JSON.stringify({ z, x, y }),
    });
  } catch {
    return empty();
  }

  if (!resp.ok) return empty();

  let payload: unknown;
  try {
    payload = await resp.json();
  } catch {
    return empty();
  }

  const buf = decodePostgrestBytea(payload);
  if (!buf || buf.byteLength === 0) return empty();

  // Buffer satisfies BodyInit under stricter TS lib.dom typings (Uint8Array
  // ArrayBufferLike is not assignable to BodyInit on recent TypeScript).
  return new Response(Buffer.from(buf), {
    status: 200,
    headers: {
      "content-type": MVT_CONTENT_TYPE,
      "cache-control": "public, max-age=300, s-maxage=86400",
    },
  });
}
