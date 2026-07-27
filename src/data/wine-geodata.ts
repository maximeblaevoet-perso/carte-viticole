/**
 * Wine geodata data-access layer (hierarchical areas + fine parcels).
 *
 * When Supabase is configured for real data, reads from PostGIS tables introduced
 * in migration `0005_wine_geodata.sql`. Otherwise falls back to the in-memory seed
 * tree in `src/data/areas.ts` (synthetic / provisional contours in `geo.ts`).
 *
 * No geometry is invented here — empty Supabase tables yield the seed fallback.
 */

import type {
  DataScope,
  GeoDataProvenance,
  SourceType,
  WineArea,
  WineLieuDit,
  WineParcel,
} from "@/lib/types";
import { getSupabaseClient, shouldUseSupabase } from "@/lib/supabase";
import {
  WINE_AREAS,
  getArea as getSeedArea,
  getChildren as getSeedChildren,
} from "./areas";

const WINE_AREA_COLUMNS =
  "id, name, level, parent_id, root_region_id, region_type, " +
  "zoom_min, zoom_max, available_data_scopes, blurb, provisional, " +
  "inao_id_app, inao_id_denom, insee_commune, " +
  "source_dataset_id, source_type, is_official, is_informative, " +
  "source_updated_at, license, attribution";

const WINE_PARCEL_COLUMNS =
  "id, commune_insee, parcel_ref, name, zoom_min, area_ha, " +
  "inao_id_aire, rpg_plot_id, cadastre_section, cadastre_numero, " +
  "source_dataset_id, source_type, is_official, is_informative, " +
  "source_updated_at, license, attribution";

const LIEU_DIT_COLUMNS =
  "id, name, commune_insee, wine_area_id, cadastre_source_ref, " +
  "source_dataset_id, source_type, is_official, is_informative, " +
  "source_updated_at, license, attribution";

type WineAreaRow = {
  id: string;
  name: string;
  level: number;
  parent_id: string | null;
  root_region_id: string;
  region_type: string;
  zoom_min: number;
  zoom_max: number;
  available_data_scopes: string[];
  blurb: string | null;
  provisional: boolean;
  inao_id_app: string | null;
  inao_id_denom: string | null;
  insee_commune: string | null;
  source_dataset_id: string | null;
  source_type: SourceType;
  is_official: boolean;
  is_informative: boolean;
  source_updated_at: string | null;
  license: string | null;
  attribution: string | null;
};

type WineParcelRow = {
  id: string;
  commune_insee: string | null;
  parcel_ref: string | null;
  name: string | null;
  zoom_min: number;
  area_ha: number | null;
  inao_id_aire: string | null;
  rpg_plot_id: string | null;
  cadastre_section: string | null;
  cadastre_numero: string | null;
  source_dataset_id: string | null;
  source_type: SourceType;
  is_official: boolean;
  is_informative: boolean;
  source_updated_at: string | null;
  license: string | null;
  attribution: string | null;
};

type LieuDitRow = {
  id: string;
  name: string;
  commune_insee: string | null;
  wine_area_id: string | null;
  cadastre_source_ref: string | null;
  source_dataset_id: string | null;
  source_type: SourceType;
  is_official: boolean;
  is_informative: boolean;
  source_updated_at: string | null;
  license: string | null;
  attribution: string | null;
};

function mapProvenance(row: {
  source_dataset_id: string | null;
  source_type: SourceType;
  is_official: boolean;
  is_informative: boolean;
  source_updated_at: string | null;
  license: string | null;
  attribution: string | null;
}): GeoDataProvenance {
  return {
    sourceDatasetId: row.source_dataset_id,
    sourceType: row.source_type,
    isOfficial: row.is_official,
    isInformative: row.is_informative,
    sourceUpdatedAt: row.source_updated_at,
    license: row.license,
    attribution: row.attribution,
  };
}

function mapWineAreaRow(row: WineAreaRow): WineArea {
  return {
    id: row.id,
    name: row.name,
    level: row.level as WineArea["level"],
    parentId: row.parent_id,
    rootRegionId: row.root_region_id,
    regionType: row.region_type as WineArea["regionType"],
    geoJsonId: row.id,
    center: [0, 0],
    zoomMin: Number(row.zoom_min),
    zoomMax: Number(row.zoom_max),
    availableDataScopes: row.available_data_scopes as DataScope[],
    blurb: row.blurb ?? undefined,
    provisional: row.provisional,
    inaoIdApp: row.inao_id_app,
    inaoIdDenom: row.inao_id_denom,
    inseeCommune: row.insee_commune,
    provenance: mapProvenance(row),
  };
}

function mapWineParcelRow(row: WineParcelRow): WineParcel {
  return {
    id: row.id,
    communeInsee: row.commune_insee,
    parcelRef: row.parcel_ref,
    name: row.name,
    center: null,
    zoomMin: Number(row.zoom_min),
    areaHa: row.area_ha != null ? Number(row.area_ha) : null,
    inaoIdAire: row.inao_id_aire,
    rpgPlotId: row.rpg_plot_id,
    cadastreSection: row.cadastre_section,
    cadastreNumero: row.cadastre_numero,
    provenance: mapProvenance(row),
  };
}

function mapLieuDitRow(row: LieuDitRow): WineLieuDit {
  return {
    id: row.id,
    name: row.name,
    communeInsee: row.commune_insee,
    wineAreaId: row.wine_area_id,
    center: null,
    cadastreSourceRef: row.cadastre_source_ref,
    provenance: mapProvenance(row),
  };
}

/**
 * All wine areas for a root region (or entire tree when `rootRegionId` omitted).
 * Falls back to the seed tree when Supabase is off or empty.
 */
export async function getWineAreas(
  rootRegionId?: string
): Promise<WineArea[]> {
  const fallback = () =>
    rootRegionId
      ? WINE_AREAS.filter(
          (a) => a.rootRegionId === rootRegionId || a.id === rootRegionId
        )
      : WINE_AREAS;

  if (!shouldUseSupabase()) return fallback();
  const client = getSupabaseClient();
  if (!client) return fallback();

  try {
    let query = client.from("wine_areas").select(WINE_AREA_COLUMNS);
    if (rootRegionId) {
      query = query.eq("root_region_id", rootRegionId);
    }
    const { data, error } = await query.order("level").order("name");
    if (error || !data || data.length === 0) return fallback();
    return (data as unknown as WineAreaRow[]).map(mapWineAreaRow);
  } catch {
    return fallback();
  }
}

/** Single area by id — seed first lookup for sync callers, async for Supabase. */
export async function getWineArea(id: string): Promise<WineArea | undefined> {
  const seed = getSeedArea(id);
  if (!shouldUseSupabase()) return seed;

  const client = getSupabaseClient();
  if (!client) return seed;

  try {
    const { data, error } = await client
      .from("wine_areas")
      .select(WINE_AREA_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return seed;
    return mapWineAreaRow(data as unknown as WineAreaRow);
  } catch {
    return seed;
  }
}

/** Direct children of an area. */
export async function getWineAreaChildren(
  parentId: string
): Promise<WineArea[]> {
  if (!shouldUseSupabase()) return getSeedChildren(parentId);
  const client = getSupabaseClient();
  if (!client) return getSeedChildren(parentId);

  try {
    const { data, error } = await client
      .from("wine_areas")
      .select(WINE_AREA_COLUMNS)
      .eq("parent_id", parentId)
      .order("name");
    if (error || !data || data.length === 0) return getSeedChildren(parentId);
    return (data as unknown as WineAreaRow[]).map(mapWineAreaRow);
  } catch {
    return getSeedChildren(parentId);
  }
}

/**
 * Fine parcels linked to a wine area (high-zoom layer). Returns `[]` when seed
 * mode or no links exist.
 */
export async function getParcelsForArea(
  wineAreaId: string
): Promise<WineParcel[]> {
  if (!shouldUseSupabase()) return [];
  const client = getSupabaseClient();
  if (!client) return [];

  try {
    const { data: links, error: linkErr } = await client
      .from("wine_area_parcels")
      .select("wine_parcel_id")
      .eq("wine_area_id", wineAreaId);
    if (linkErr || !links || links.length === 0) return [];

    const ids = links.map((l) => (l as { wine_parcel_id: string }).wine_parcel_id);
    const { data, error } = await client
      .from("wine_parcels")
      .select(WINE_PARCEL_COLUMNS)
      .in("id", ids);
    if (error || !data) return [];
    return (data as unknown as WineParcelRow[]).map(mapWineParcelRow);
  } catch {
    return [];
  }
}

/** Lieux-dits for a wine area (Champagne labelling use case). */
export async function getLieuxDitsForArea(
  wineAreaId: string
): Promise<WineLieuDit[]> {
  if (!shouldUseSupabase()) return [];
  const client = getSupabaseClient();
  if (!client) return [];

  try {
    const { data, error } = await client
      .from("wine_lieux_dits")
      .select(LIEU_DIT_COLUMNS)
      .eq("wine_area_id", wineAreaId)
      .order("name");
    if (error || !data) return [];
    return (data as unknown as LieuDitRow[]).map(mapLieuDitRow);
  } catch {
    return [];
  }
}
