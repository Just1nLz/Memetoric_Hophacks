import { useState } from "react";
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

type DayPoint = { t: string; tweets: number; likes: number; views?: number; quotes?: number };

type VolumeProps = {
  series: DayPoint[];
  activeDay?: string | null;
  onSelectDay?: (day: string) => void;
};

export function Volume({ series, activeDay, onSelectDay }: VolumeProps) {
  const [metric, setMetric] = useState<"tweets" | "likes">("tweets");
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(...series.map((s) => (metric === "tweets" ? s.tweets : s.likes)), 1);
  const focus = series.find((s) => s.t === (hover ?? activeDay)) ?? series.at(-1) ?? null;
  const first = series[0]?.t;
  const last = series.at(-1)?.t;

  return (
    <div className="volume-panel">
      <div className="volume-head">
        <div>
          <p className="kicker">Daily volume</p>
          <p className="volume-help">
            Posts (or likes) per UTC day in this family. Click a bar to jump the timeline to that day.
          </p>
        </div>
        <div className="volume-toggle" role="group" aria-label="Volume metric">
          <button type="button" className={metric === "tweets" ? "on" : ""} onClick={() => setMetric("tweets")}>
            Posts
          </button>
          <button type="button" className={metric === "likes" ? "on" : ""} onClick={() => setMetric("likes")}>
            Likes
          </button>
        </div>
      </div>
      <div className="volume">
        {series.map((s) => {
          const value = metric === "tweets" ? s.tweets : s.likes;
          const on = s.t === activeDay;
          const hot = s.t === hover;
          return (
            <button
              key={s.t}
              type="button"
              className={`bar-col ${on ? "on" : ""} ${hot ? "hot" : ""}`}
              aria-label={`${dayLabel(s.t)} · ${s.tweets} posts · ${compact(s.likes)} likes`}
              title={`${dayLabel(s.t)} · ${s.tweets} posts · ${compact(s.likes)} likes`}
              onMouseEnter={() => setHover(s.t)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelectDay?.(s.t)}
            >
              <div className="bar" style={{ height: `${Math.max(6, (value / max) * 100)}%` }} />
            </button>
          );
        })}
      </div>
      <div className="volume-foot">
        <span>{first ? dayLabel(first) : "—"}</span>
        <strong>
          {focus
            ? `${dayLabel(focus.t)} · ${focus.tweets} posts · ${compact(focus.likes)} likes`
            : "Hover a day"}
        </strong>
        <span>{last ? dayLabel(last) : "—"}</span>
      </div>
    </div>
  );
}
