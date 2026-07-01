"use client";

/**
 * Client hooks over the climate data-access layer (`src/data/climate.ts`).
 *
 * In synthetic mode, the synthetic value is used as an instant seed so charts
 * render immediately. In real mode (`NEXT_PUBLIC_DATA_SOURCE=real`), hooks wait
 * for Supabase and only fall back to synthetic when the data layer returns it
 * (missing row or error). Each record carries its own `sourceType`.
 */

import { useEffect, useState } from "react";
import type { RegionVintageClimate } from "@/lib/types";
import {
  getRegionVintageClimates,
  getSyntheticRegionVintages,
  getSyntheticVintage,
  getVintageClimate,
} from "@/data/climate";
import { shouldUseSupabase } from "@/lib/supabase";

const useRealData = shouldUseSupabase();

/** Single region × vintage. */
export function useVintageClimate(
  regionId: string | null | undefined,
  year: number
): RegionVintageClimate | undefined {
  const [vintage, setVintage] = useState<RegionVintageClimate | undefined>(() => {
    if (!regionId) return undefined;
    return useRealData ? undefined : getSyntheticVintage(regionId, year);
  });

  useEffect(() => {
    if (!regionId) {
      setVintage(undefined);
      return;
    }
    let active = true;
    if (!useRealData) {
      setVintage(getSyntheticVintage(regionId, year));
    } else {
      setVintage(undefined);
    }
    getVintageClimate(regionId, year).then((v) => {
      if (active && v) setVintage(v);
    });
    return () => {
      active = false;
    };
  }, [regionId, year]);

  return vintage;
}

/** All vintages for a region. */
export function useRegionVintageClimates(
  regionId: string | null | undefined
): RegionVintageClimate[] {
  const [vintages, setVintages] = useState<RegionVintageClimate[]>(() => {
    if (!regionId) return [];
    return useRealData ? [] : getSyntheticRegionVintages(regionId);
  });

  useEffect(() => {
    if (!regionId) {
      setVintages([]);
      return;
    }
    let active = true;
    if (!useRealData) {
      setVintages(getSyntheticRegionVintages(regionId));
    } else {
      setVintages([]);
    }
    getRegionVintageClimates(regionId).then((v) => {
      if (active && v.length > 0) setVintages(v);
    });
    return () => {
      active = false;
    };
  }, [regionId]);

  return vintages;
}
