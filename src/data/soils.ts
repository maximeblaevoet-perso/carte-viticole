/**
 * Synthetic soil descriptions per region (matches `region_soils`).
 * Editorial / synthetic for V1 — replace with sourced data later.
 */
import type { RegionSoil } from "@/lib/types";

export const REGION_SOILS: RegionSoil[] = [
  // Bordeaux
  { regionId: "bordeaux", soilType: "Graves", description: "Graves garonnaises, drainantes, favorables aux cepages tardifs (rive gauche).", sharePercent: 35, sourceType: "synthetic" },
  { regionId: "bordeaux", soilType: "Argilo-calcaire", description: "Sols argilo-calcaires retenant l'eau, frais (rive droite).", sharePercent: 40, sourceType: "synthetic" },
  { regionId: "bordeaux", soilType: "Sables", description: "Sols sableux, plus precoces et sensibles a la secheresse.", sharePercent: 25, sourceType: "synthetic" },
  // Bourgogne
  { regionId: "bourgogne", soilType: "Calcaire (Jurassique)", description: "Marnes et calcaires de la Cote, structurants pour le Pinot noir et le Chardonnay.", sharePercent: 60, sourceType: "synthetic" },
  { regionId: "bourgogne", soilType: "Marnes", description: "Marnes argilo-calcaires des coteaux, retention en eau moderee.", sharePercent: 30, sourceType: "synthetic" },
  { regionId: "bourgogne", soilType: "Eboulis", description: "Eboulis de pente, drainants, en haut de coteau.", sharePercent: 10, sourceType: "synthetic" },
  // Rhone
  { regionId: "rhone", soilType: "Galets roules", description: "Galets roules accumulant la chaleur, emblematiques du sud.", sharePercent: 30, sourceType: "synthetic" },
  { regionId: "rhone", soilType: "Granite / schistes", description: "Sols granitiques et schisteux du nord (cotes-rotie, hermitage).", sharePercent: 35, sourceType: "synthetic" },
  { regionId: "rhone", soilType: "Argilo-calcaire / sable", description: "Terrasses argilo-calcaires et sableuses, variees selon les terroirs.", sharePercent: 35, sourceType: "synthetic" },
];

export function getRegionSoils(regionId: string): RegionSoil[] {
  return REGION_SOILS.filter((s) => s.regionId === regionId);
}
