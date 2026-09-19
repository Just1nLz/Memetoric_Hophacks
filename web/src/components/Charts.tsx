import { compact, dayLabel } from "../format";
import type { Snapshot } from "../types";

type Props = {
  snapshots: Snapshot[];
};

export function Spark({ snapshots }: Props) {
  const w = 320;
  const h = 92;
  const pad = 8;
  if (!snapshots.length) return <div className="spark empty">No trajectory yet.</div>;

  const series = snapshots.map((s) => s.like_count + s.views_count / 50);
  const max = Math.max(...series, 1);
  const step = (w - pad * 2) / Math.max(series.length - 1, 1);
  const pts = series.map((v, i) => {
    const x = pad + i * step;
    const y = h - pad - (v / max) * (h - pad * 2);
    return `${x},${y}`;
  });

  return (
    <div className="spark">
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h}>
        <polyline points={pts.join(" ")} fill="none" className="spark-line" />
        {snapshots.map((s, i) => {
          const x = pad + i * step;
          const y = h - pad - (series[i] / max) * (h - pad * 2);
          return <circle key={s.version + i} cx={x} cy={y} r={2.6} className="spark-dot" />;
        })}
      </svg>
      <div className="spark-axis">
        <span>{snapshots.length} snapshots</span>
        <span>{compact(snapshots.at(-1)?.like_count ?? 0)} likes @ last version</span>
      </div>
    </div>
  );
}

export function Volume({ series }: { series: { t: string; tweets: number; likes: number }[] }) {
  const max = Math.max(...series.map((s) => s.tweets), 1);
  return (
    <div className="volume">
      {series.map((s) => (
        <div key={s.t} className="bar-col" title={`${s.t}: ${s.tweets} tweets`}>
          <div className="bar" style={{ height: `${(s.tweets / max) * 100}%` }} />
          <span>{dayLabel(s.t)}</span>
        </div>
      ))}
    </div>
  );
}
