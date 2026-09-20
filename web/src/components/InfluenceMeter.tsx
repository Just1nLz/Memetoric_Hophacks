import type { InfluenceReport } from "../influence";

export function IndexMeter({ report, compact = false }: { report: InfluenceReport; compact?: boolean }) {
  return (
    <div className={`idx-meter ${compact ? "compact" : ""}`} aria-hidden>
      <b className={`band-${report.band}`} style={{ width: `${Math.max(4, report.index)}%` }} />
    </div>
  );
}
