/**
 * Reference domains of a region, with their composed terroir score (ADR 0016,
 * ADR 0019).
 *
 * Reads the `wine_domains_api` view (migration 0013) with the server-side key;
 * the browser only gets the flat list. No backend → empty list, never invented
 * domains.
 */

import { NextRequest, NextResponse } from "next/server";
import type { DomainPlace, WineDomain } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

function none(): NextResponse {
  return NextResponse.json({ domains: [] as WineDomain[] });
}

type Row = Record<string, unknown>;

const num = (v: unknown): number | null =>
  v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v);
const str = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 ? v : null;
const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

function toPlace(r: Row): DomainPlace {
  return {
    kind: (str(r.kind) as DomainPlace["kind"]) ?? "reste",
    name: String(r.name ?? ""),
    areaHa: num(r.area_ha),
    basis: (str(r.basis) as DomainPlace["basis"]) ?? null,
    vineHa: num(r.vine_ha),
    scoreSun: num(r.score_sun),
    scoreCool: num(r.score_cool),
    grandCru: str(r.grand_cru) ?? undefined,
    premierCru: str(r.premier_cru) ?? undefined,
    village: str(r.village) ?? undefined,
    lieux: Array.isArray(r.lieux) ? (r.lieux as DomainPlace["lieux"]) : undefined,
    communes: Array.isArray(r.communes) ? strArr(r.communes) : undefined,
    distanceM: num(r.distance_m) ?? undefined,
    lon: num(r.lon) ?? undefined,
    lat: num(r.lat) ?? undefined,
    geometry: (r.geometry as DomainPlace["geometry"]) ?? undefined,
  };
}

function toDomain(r: Row): WineDomain | null {
  const lon = num(r.lon);
  const lat = num(r.lat);
  if (lon == null || lat == null || typeof r.id !== "string") return null;
  return {
    id: r.id,
    rootRegionId: String(r.root_region_id),
    name: String(r.name),
    commune: str(r.commune),
    communeInsee: str(r.commune_insee),
    lon,
    lat,
    coordPrecision: (str(r.coord_precision) as WineDomain["coordPrecision"]) ?? null,
    surfaceHa: num(r.surface_ha),
    surfaceNote: str(r.surface_note),
    grandsCrus: strArr(r.grands_crus),
    premiersCrus: strArr(r.premiers_crus),
    villages: strArr(r.villages),
    lieuxDits: strArr(r.lieux_dits),
    communes: strArr(r.communes),
    certification: str(r.certification),
    sources: strArr(r.sources),
    sourceConfidence: (str(r.source_confidence) as WineDomain["sourceConfidence"]) ?? null,
    scoreSun: num(r.score_sun),
    scoreCool: num(r.score_cool),
    sectorScoreSun: num(r.sector_score_sun),
    sectorScoreCool: num(r.sector_score_cool),
    terroir: (r.terroir as WineDomain["terroir"]) ?? {},
    composition: Array.isArray(r.composition) ? (r.composition as Row[]).map(toPlace) : [],
    unresolvedPlaces: strArr(r.unresolved_places),
    scoreConfidence: (str(r.score_confidence) as WineDomain["scoreConfidence"]) ?? null,
    sourceType: (str(r.source_type) as WineDomain["sourceType"]) ?? "manual",
  };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const region = req.nextUrl.searchParams.get("region") ?? "";
  if (!/^[a-z-]+$/.test(region) || !SUPABASE_URL || !SUPABASE_KEY) return none();

  const endpoint =
    `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/wine_domains_api` +
    `?select=*&root_region_id=eq.${region}&order=score_sun.desc.nullslast`;

  let rows: unknown;
  try {
    const resp = await fetch(endpoint, {
      cache: "no-store",
      headers: {
        apikey: SUPABASE_KEY,
        authorization: `Bearer ${SUPABASE_KEY}`,
        accept: "application/json",
      },
    });
    if (!resp.ok) return none();
    rows = await resp.json();
  } catch {
    return none();
  }
  if (!Array.isArray(rows)) return none();

  const domains = rows
    .map((r) => toDomain(r as Row))
    .filter((d): d is WineDomain => d !== null);
  return NextResponse.json(
    { domains },
    { headers: { "cache-control": "public, max-age=300, s-maxage=300" } }
  );
}
