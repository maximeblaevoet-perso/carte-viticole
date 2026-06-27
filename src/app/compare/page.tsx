import { CompareView } from "@/components/compare/CompareView";
import { getRegion } from "@/data/regions";
import { FIRST_YEAR } from "@/data/synthetic";

const DEFAULT_REGION = "bordeaux";

export default function ComparePage({
  searchParams,
}: {
  searchParams: { region?: string; a?: string; b?: string };
}) {
  const region = getRegion(searchParams.region ?? "")?.id ?? DEFAULT_REGION;
  const a = Number(searchParams.a) || 2018;
  const b = Number(searchParams.b) || 2021;

  // Guard against out-of-range years.
  const clampYear = (y: number) => (y >= FIRST_YEAR ? y : 2018);

  return (
    <main className="min-h-screen bg-slate-50">
      <CompareView
        initialRegion={region}
        initialA={clampYear(a)}
        initialB={clampYear(b)}
      />
    </main>
  );
}
