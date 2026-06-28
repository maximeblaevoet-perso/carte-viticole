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
  // Alsace
  { regionId: "alsace", soilType: "Calcaire", description: "Calcaires bien draines des coteaux, favorables a la tension et a la precision aromatique.", sharePercent: 40, sourceType: "synthetic" },
  { regionId: "alsace", soilType: "Marnes", description: "Marnes qui retiennent un peu d'eau et modulent la fraicheur des parcelles.", sharePercent: 35, sourceType: "synthetic" },
  { regionId: "alsace", soilType: "Granite", description: "Socles granitiques des secteurs plus montagnards, donnant des vins plus toniques.", sharePercent: 25, sourceType: "synthetic" },
  // Champagne
  { regionId: "champagne", soilType: "Craie", description: "Craie champenoise, tres filtrante, stockant l'eau en profondeur et renvoyant la chaleur.", sharePercent: 50, sourceType: "synthetic" },
  { regionId: "champagne", soilType: "Marnes", description: "Marnes plus lourdes, apportant de la reserve hydrique dans les coteaux.", sharePercent: 30, sourceType: "synthetic" },
  { regionId: "champagne", soilType: "Argiles", description: "Argiles de bas de pente, plus fraiches et plus tardives.", sharePercent: 20, sourceType: "synthetic" },
  // Loire
  { regionId: "loire", soilType: "Tuffeau", description: "Tuffeau de la moyenne Loire, clair, poreux et tres typique de la region.", sharePercent: 45, sourceType: "synthetic" },
  { regionId: "loire", soilType: "Silex / argiles a silex", description: "Silex et argiles a silex, favorisant le drainage et la chaleur.", sharePercent: 35, sourceType: "synthetic" },
  { regionId: "loire", soilType: "Argilo-calcaire", description: "Couvertures argilo-calcaires plus profondes, avec une bonne reserve en eau.", sharePercent: 20, sourceType: "synthetic" },
  // Corse
  { regionId: "corse", soilType: "Granite", description: "Socles granitiques, tres presents dans l'interieur et apportant des vins tendus.", sharePercent: 45, sourceType: "synthetic" },
  { regionId: "corse", soilType: "Schistes", description: "Schistes des secteurs littoraux ou intermediaires, drainants et expressifs.", sharePercent: 35, sourceType: "synthetic" },
  { regionId: "corse", soilType: "Argiles sableuses", description: "Depots plus meubles des plaines et bas de versant, plus precoces.", sharePercent: 20, sourceType: "synthetic" },
  // Provence
  { regionId: "provence", soilType: "Calcaire", description: "Calcaires clairs et pierreux, chauffant vite et limitant la vigueur.", sharePercent: 40, sourceType: "synthetic" },
  { regionId: "provence", soilType: "Argilo-calcaire", description: "Matrice argilo-calcaire de coteau, avec une reserve en eau moderee.", sharePercent: 35, sourceType: "synthetic" },
  { regionId: "provence", soilType: "Sables / galets", description: "Terrasses sableuses ou caillouteuses, plus chaudes et plus sechantes.", sharePercent: 25, sourceType: "synthetic" },
  // Beaujolais
  { regionId: "beaujolais", soilType: "Granite rose", description: "Granites roses du nord du Beaujolais, drainants et peu fertiles.", sharePercent: 45, sourceType: "synthetic" },
  { regionId: "beaujolais", soilType: "Schistes", description: "Schistes et roches metamorphiques, donnant des profils plus structures.", sharePercent: 30, sourceType: "synthetic" },
  { regionId: "beaujolais", soilType: "Argilo-calcaire", description: "Bas de coteaux argilo-calcaires, plus ronds et plus frais.", sharePercent: 25, sourceType: "synthetic" },
  // Jura
  { regionId: "jura", soilType: "Marnes bleu-gris", description: "Marnes jurassiennes riches en argiles, typiques des coteaux frais.", sharePercent: 45, sourceType: "synthetic" },
  { regionId: "jura", soilType: "Calcaires", description: "Calcaires compacts et fissures, favorisant le drainage et la tension.", sharePercent: 35, sourceType: "synthetic" },
  { regionId: "jura", soilType: "Eboulis / graviers", description: "Pentes pierreuses et eboulis, plus chauds et precoces.", sharePercent: 20, sourceType: "synthetic" },
  // Savoie
  { regionId: "savoie", soilType: "Moraines", description: "Depots glaciaires varies, assez drainants et heterogenes.", sharePercent: 40, sourceType: "synthetic" },
  { regionId: "savoie", soilType: "Alluvions", description: "Alluvions de vallee, plus profondes et souvent plus fertiles.", sharePercent: 35, sourceType: "synthetic" },
  { regionId: "savoie", soilType: "Calcaires alpins", description: "Calcaires des versants alpins, qui structurent et rechauffent.", sharePercent: 25, sourceType: "synthetic" },
  // Languedoc-Roussillon
  { regionId: "languedoc-roussillon", soilType: "Schistes", description: "Schistes chauffants des coteaux littoraux et des aspres.", sharePercent: 40, sourceType: "synthetic" },
  { regionId: "languedoc-roussillon", soilType: "Calcaires", description: "Calcaires secs et pierreux, dominants sur une partie des coteaux.", sharePercent: 35, sourceType: "synthetic" },
  { regionId: "languedoc-roussillon", soilType: "Galets / alluvions", description: "Terrasses de galets et alluvions, plus chaudes et filtrantes.", sharePercent: 25, sourceType: "synthetic" },
];

export function getRegionSoils(regionId: string): RegionSoil[] {
  return REGION_SOILS.filter((s) => s.regionId === regionId);
}
