import { sourceBadge } from "@/lib/format";
import type { SourceType } from "@/lib/types";

export function SourceBadge({
  sourceType,
  confidence,
}: {
  sourceType: SourceType;
  confidence?: number;
}) {
  const { label, tone } = sourceBadge(sourceType);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone}`}
      title={
        confidence !== undefined
          ? `Confiance: ${Math.round(confidence * 100)}%`
          : undefined
      }
    >
      {label}
      {confidence !== undefined && (
        <span className="opacity-70">· {Math.round(confidence * 100)}%</span>
      )}
    </span>
  );
}
