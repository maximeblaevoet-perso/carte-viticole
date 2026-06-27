/**
 * Generic external vintage scores (matches `vintage_scores`).
 *
 * V1 does NOT integrate any protected/proprietary critic (e.g. Parker). This is
 * a neutral, generic container. The few demo rows below are SYNTHETIC and use a
 * placeholder source name. Do not scrape protected wine-review content.
 */
import type { VintageScore } from "@/lib/types";

export const VINTAGE_SCORES: VintageScore[] = [
  { regionId: "bordeaux", year: 2018, sourceName: "Demo (placeholder)", scoreValue: 95, scoreScale: "0-100", note: "Exemple synthetique, non issu d'une source reelle.", sourceType: "synthetic" },
  { regionId: "bordeaux", year: 2021, sourceName: "Demo (placeholder)", scoreValue: 89, scoreScale: "0-100", note: "Exemple synthetique, non issu d'une source reelle.", sourceType: "synthetic" },
  { regionId: "bourgogne", year: 2019, sourceName: "Demo (placeholder)", scoreValue: 94, scoreScale: "0-100", note: "Exemple synthetique, non issu d'une source reelle.", sourceType: "synthetic" },
  { regionId: "rhone", year: 2010, sourceName: "Demo (placeholder)", scoreValue: 96, scoreScale: "0-100", note: "Exemple synthetique, non issu d'une source reelle.", sourceType: "synthetic" },
];

export function getVintageScores(regionId: string, year?: number): VintageScore[] {
  return VINTAGE_SCORES.filter(
    (s) => s.regionId === regionId && (year === undefined || s.year === year)
  );
}
