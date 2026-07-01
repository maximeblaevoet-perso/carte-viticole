/**
 * Minimal Supabase access for the frontend.
 *
 * V1 defaults to synthetic data when Supabase is not configured. When the
 * public env vars are present AND `NEXT_PUBLIC_DATA_SOURCE` is set to `real`,
 * the data-access layer (`src/data/climate.ts`) reads real aggregates from
 * `region_vintage_climate`. The frontend NEVER reads `daily_weather` (that
 * table is the ingestion/computation source only — see ADR 0005).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Minimal schema so `.from("region_vintage_climate")` is typed (no generated types yet). */
export interface Database {
  public: {
    Tables: {
      region_vintage_climate: {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const dataSource = process.env.NEXT_PUBLIC_DATA_SOURCE ?? "synthetic";

/**
 * True when the app should serve real Supabase data. Requires both public
 * credentials AND an explicit opt-in via `NEXT_PUBLIC_DATA_SOURCE=real`, so the
 * default demo experience stays synthetic.
 */
export function shouldUseSupabase(): boolean {
  return Boolean(url && anonKey) && dataSource === "real";
}

let _client: SupabaseClient<Database> | null | undefined;

/** Memoized browser/server client, or `null` when Supabase is not configured. */
export function getSupabaseClient(): SupabaseClient<Database> | null {
  if (_client !== undefined) return _client;
  _client = url && anonKey ? createClient<Database>(url, anonKey) : null;
  return _client;
}
