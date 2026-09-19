import { useState } from "react";
import { compact, dayLabel } from "../format";
import { phaseLabel, saturationCopy } from "../saturation";
import type { DayPoint } from "../types";

type VolumeProps = {
  series: DayPoint[];
  peakDay?: string | null;
  activeDay?: string | null;
  onSelectDay?: (day: string) => void;
};

export function Volume({ series, peakDay, activeDay, onSelectDay }: VolumeProps) {
  const [metric, setMetric] = useState<"tweets" | "likes">("tweets");
  const [hover, setHover] = useState<string | null>(null);
  const live = series.filter((s) => s.coverage !== false);
  const max = Math.max(...live.map((s) => (metric === "tweets" ? s.tweets : s.likes)), 1);
  const focus = series.find((s) => s.t === (hover ?? activeDay)) ?? live.at(-1) ?? series.at(-1) ?? null;
  const first = series[0]?.t;
  const last = series.at(-1)?.t;

  return (
    <div className="volume-panel">
      <div className="volume-head">
        <div>
          <p className="kicker">Monthly usage + saturation</p>
          <p className="volume-help">
            Full window on the axis. Color is lifecycle: rising, peak, cooling, then saturated (late use reads as cringe).
            Gray days have no local firehose.
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
          const uncovered = s.coverage === false;
          const h = uncovered ? 8 : Math.max(6, (value / max) * 100);
          return (
            <button
              key={s.t}
              type="button"
              className={`bar-col phase-${s.phase ?? "unknown"} ${on ? "on" : ""} ${hot ? "hot" : ""} ${uncovered ? "uncovered" : ""}`}
              aria-label={`${dayLabel(s.t)} · ${s.tweets} posts · ${phaseLabel(s.phase)}`}
              title={`${dayLabel(s.t)} · ${compact(s.tweets)} posts · ${phaseLabel(s.phase)}`}
              onMouseEnter={() => setHover(s.t)}
              onMouseLeave={() => setHover(null)}
              onClick={() => !uncovered && onSelectDay?.(s.t)}
            >
              <div className="bar" style={{ height: `${h}%` }} />
            </button>
          );
        })}
      </div>
      <div className="sat-legend" aria-hidden>
        <i className="phase-rising" /> rising
        <i className="phase-peak" /> peak
        <i className="phase-decline" /> cooling
        <i className="phase-saturated" /> saturated
        <i className="phase-uncovered" /> no data
      </div>
      <div className="volume-foot">
        <span>{first ? dayLabel(first) : "—"}</span>
        <strong>
          {focus
            ? `${dayLabel(focus.t)} · ${compact(focus.tweets)} posts · ${phaseLabel(focus.phase)}`
            : "Hover a day"}
        </strong>
        <span>{last ? dayLabel(last) : "—"}</span>
      </div>
      {focus && <p className="sat-readout">{saturationCopy(focus, peakDay ?? null)}</p>}
    </div>
  );
}
