/**
 * "What is the topsoil made of?" — the surface-soil half of the subsoil card.
 *
 * BRGM answers the *rock* under a point (`src/lib/geology-info.ts`) but carries
 * no usable soil layer: its `EPAISSEUR_ALTERITES` model covers Bretagne only
 * and returns no value. ISRIC **SoilGrids v2.0** fills that gap — a global soil
 * model with a key-free, CORS-open REST API (CC-BY 4.0).
 *
 * The two sources are complementary and must stay visibly distinct in the UI:
 *
 * | | BRGM lithology | ISRIC SoilGrids |
 * |---|---|---|
 * | answers | rock family under the point | texture of the first 30 cm |
 * | nature | geological survey, 1/1 000 000 | global ML prediction, 250 m raster |
 *
 * **Granularity caveat.** A 250 m pixel is 6.25 ha. An Alsace grand cru runs
 * roughly 3–80 ha, so a cru gets between one and a dozen pixels: enough for an
 * indicative texture *per cru*, never enough to resolve variation *within* one.
 * It is also a worldwide model fitted to a global profile database, not a
 * French field survey — it will not reproduce the soil boundaries that define a
 * climat. See `docs/data-sources.md`.
 */

const SOILGRIDS_API = "https://rest.isric.org/soilgrids/v2.0/properties/query";

export const SOILGRIDS_ATTRIBUTION = "© ISRIC SoilGrids (CC-BY 4.0)";

/**
 * Depth slices requested, with the thickness each one weighs in the 0–30 cm
 * average. SoilGrids has no `0-30cm` slice — asking for one returns nothing —
 * so the rooting-zone figure is a thickness-weighted mean of the three real
 * slices.
 */
const SLICES: { label: string; thicknessCm: number }[] = [
  { label: "0-5cm", thicknessCm: 5 },
  { label: "5-15cm", thicknessCm: 10 },
  { label: "15-30cm", thicknessCm: 15 },
];

/** Point-query URL. SoilGrids takes lon/lat in WGS84 degrees. */
export function soilTextureUrl(lon: number, lat: number): string {
  const params = new URLSearchParams({
    lon: lon.toFixed(6),
    lat: lat.toFixed(6),
    value: "mean",
  });
  for (const p of ["clay", "sand", "silt", "phh2o"]) {
    params.append("property", p);
  }
  for (const s of SLICES) params.append("depth", s.label);
  return `${SOILGRIDS_API}?${params.toString()}`;
}

export interface SoilTexture {
  /** Percentages over 0–30 cm, rounded. They sum to ~100. */
  clay: number;
  sand: number;
  silt: number;
  /** Soil pH in water, or `null` when the model has no value here. */
  ph: number | null;
  /** Plain-French texture, e.g. "Terre argilo-limoneuse". */
  label: string;
  /** One line on how that soil behaves for a vine. */
  gloss: string;
}

/** Minimal shape of the SoilGrids response we rely on. */
interface SoilGridsResponse {
  properties?: {
    layers?: {
      name?: string;
      unit_measure?: { d_factor?: number };
      depths?: { label?: string; values?: { mean?: number | null } }[];
    }[];
  };
}

/**
 * Thickness-weighted mean of one property over the 0–30 cm slices, converted
 * from SoilGrids' mapped units by its own `d_factor` (clay/sand/silt come back
 * in g/kg ÷ 10 → %, pH as pH×10 ÷ 10). Returns `null` when every slice is
 * `null`, which is how SoilGrids reports a masked pixel (water, rock, city).
 */
function weightedMean(
  layers: NonNullable<NonNullable<SoilGridsResponse["properties"]>["layers"]>,
  name: string,
): number | null {
  const layer = layers.find((l) => l.name === name);
  if (!layer) return null;
  const factor = layer.unit_measure?.d_factor || 1;

  let sum = 0;
  let weight = 0;
  for (const slice of SLICES) {
    const value = layer.depths?.find((d) => d.label === slice.label)?.values
      ?.mean;
    if (typeof value !== "number") continue;
    sum += (value / factor) * slice.thicknessCm;
    weight += slice.thicknessCm;
  }
  return weight === 0 ? null : sum / weight;
}

/**
 * USDA texture triangle, with French names. The order of the tests matters:
 * each class is expressed as "what is left once the classes above are ruled
 * out", exactly as in the USDA decision sequence.
 */
function classify(clay: number, sand: number, silt: number): string {
  if (clay >= 40 && silt >= 40) return "argilo-limoneuse";
  if (clay >= 35 && sand >= 45) return "argilo-sableuse";
  if (clay >= 40) return "argileuse";
  if (clay >= 27) return sand >= 20 ? "argilo-sableuse" : "argilo-limoneuse";
  if (silt >= 80 && clay < 12) return "très limoneuse";
  if (silt >= 50) return "limoneuse fine";
  if (clay >= 20 && sand >= 45 && silt < 28) return "limono-sableuse";
  if (clay < 20 && sand >= 85) return "sableuse";
  if (clay < 15 && sand >= 70) return "sablo-limoneuse";
  if (sand >= 52) return "limono-sableuse";
  return "limoneuse";
}

/** One line on what that texture does to a vine, keyed by dominant fraction. */
function glossFor(texture: string): string {
  if (texture.startsWith("argil")) {
    return "Terre lourde : bonne réserve en eau, se réchauffe lentement au printemps.";
  }
  if (texture.startsWith("sabl")) {
    return "Terre légère : très drainante, se réchauffe vite, peu de réserve en eau.";
  }
  return "Terre équilibrée : réserve en eau correcte et drainage convenable.";
}

/**
 * Parse a SoilGrids response into a readable texture. Returns `null` when the
 * pixel is masked (every value `null`) or the payload is not the expected
 * shape — the caller then shows the BRGM half alone.
 */
export function parseSoilTexture(payload: unknown): SoilTexture | null {
  const layers = (payload as SoilGridsResponse)?.properties?.layers;
  if (!Array.isArray(layers)) return null;

  const clay = weightedMean(layers, "clay");
  const sand = weightedMean(layers, "sand");
  const silt = weightedMean(layers, "silt");
  if (clay === null || sand === null || silt === null) return null;

  const texture = classify(clay, sand, silt);
  const ph = weightedMean(layers, "phh2o");
  return {
    clay: Math.round(clay),
    sand: Math.round(sand),
    silt: Math.round(silt),
    ph: ph === null ? null : Math.round(ph * 10) / 10,
    label: `Terre ${texture}`,
    gloss: glossFor(texture),
  };
}
