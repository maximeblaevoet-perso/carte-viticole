"use client";

import { useEffect, useState } from "react";
import { shouldUseSupabase } from "@/lib/supabase";
import type { WineDomain } from "@/lib/types";

/** One request per region per page load, shared by the map and the panel. */
const cache = new Map<string, Promise<WineDomain[]>>();

export function fetchDomains(regionId: string): Promise<WineDomain[]> {
  let p = cache.get(regionId);
  if (!p) {
    p = fetch(`/api/wine/domains?region=${encodeURIComponent(regionId)}`)
      .then((r) => (r.ok ? r.json() : { domains: [] }))
      .then((body: { domains?: WineDomain[] }) => body.domains ?? [])
      .catch(() => []);
    cache.set(regionId, p);
  }
  return p;
}

/** Reference domains of a region (empty in synthetic mode or without data). */
export function useDomains(regionId: string | null | undefined): WineDomain[] {
  const [domains, setDomains] = useState<WineDomain[]>([]);
  useEffect(() => {
    if (!regionId || !shouldUseSupabase()) {
      setDomains([]);
      return;
    }
    let live = true;
    fetchDomains(regionId).then((d) => {
      if (live) setDomains(d);
    });
    return () => {
      live = false;
    };
  }, [regionId]);
  return domains;
}
