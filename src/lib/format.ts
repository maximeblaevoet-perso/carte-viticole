/** Small formatting helpers shared by the UI. */

export function fmtNumber(value: number, decimals = 0): string {
  return value.toLocaleString("fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function fmtWithUnit(value: number, unit: string, decimals = 0): string {
  const n = fmtNumber(value, decimals);
  return unit ? `${n} ${unit}` : n;
}

export const MONTH_LABELS_SHORT = [
  "Jan", "Fev", "Mar", "Avr", "Mai", "Jui",
  "Jul", "Aou", "Sep", "Oct", "Nov", "Dec",
];

/** Map a source_type to a short French badge label. */
export function sourceBadge(sourceType: string): { label: string; tone: string } {
  switch (sourceType) {
    case "real":
      return { label: "Donnees reelles", tone: "bg-leaf-500/15 text-leaf-600 border-leaf-500/30" };
    case "manual":
      return { label: "Saisie manuelle", tone: "bg-amber-500/15 text-amber-700 border-amber-500/30" };
    case "synthetic":
    default:
      return { label: "Donnees synthetiques", tone: "bg-wine-500/15 text-wine-700 border-wine-500/30" };
  }
}
