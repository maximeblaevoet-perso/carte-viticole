import { notFound } from "next/navigation";
import { getRegion, REGION_BASELINES } from "@/data/regions";
import { getVintage, YEARS } from "@/data/synthetic";
import { getRegionSoils } from "@/data/soils";
import { getVintageScores } from "@/data/scores";
import { VintageDetail } from "@/components/vintage/VintageDetail";

export function generateStaticParams() {
  return REGION_BASELINES.flatMap((r) =>
    YEARS.map((y) => ({ region: r.id, year: String(y) }))
  );
}

export default function VintagePage({
  params,
}: {
  params: { region: string; year: string };
}) {
  const region = getRegion(params.region);
  const year = Number(params.year);
  const vintage = region ? getVintage(region.id, year) : undefined;

  if (!region || !vintage) {
    notFound();
  }

  const soils = getRegionSoils(region.id);
  const scores = getVintageScores(region.id, year);

  return (
    <main className="min-h-screen bg-slate-50">
      <VintageDetail
        region={region}
        vintage={vintage}
        soils={soils}
        scores={scores}
      />
    </main>
  );
}
