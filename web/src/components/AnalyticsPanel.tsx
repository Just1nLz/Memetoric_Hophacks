import { Volume } from "./Charts";
import { compact } from "../format";
import type { DayMutations } from "../saturation";
import type { DayPoint } from "../types";

type Props = {
  open: boolean;
  series: DayPoint[];
  peakDay?: string | null;
  mutations?: Map<string, DayMutations>;
  activeDay?: string | null;
  onSelectDay?: (day: string) => void;
  onClose: () => void;
};

export function AnalyticsPanel({
  open,
  series,
  peakDay,
  mutations,
  activeDay,
  onSelectDay,
  onClose,
}: Props) {
  if (!open) return null;
  const live = series.filter((s) => s.coverage !== false);
  const velocity = live.map((s, i) => (i === 0 ? s.tweets : s.tweets - live[i - 1].tweets));
  const peakV = Math.max(1, ...velocity.map((v) => Math.abs(v)));

  return (
    <div className="analytics-sheet" role="dialog" aria-label="Meme analytics">
      <header className="analytics-head">
        <div>
          <p className="kicker">Analytics</p>
          <h2>Propagation over the month</h2>
        </div>
        <button type="button" className="icon-btn" aria-label="Close analytics" onClick={onClose}>
          ×
        </button>
      </header>
      <Volume
        series={series}
        peakDay={peakDay}
        mutations={mutations}
        activeDay={activeDay}
        onSelectDay={onSelectDay}
      />
      <div className="velocity-row">
        <p className="kicker">Propagation velocity</p>
        <div className="velocity-bars" aria-hidden>
          {velocity.map((v, i) => (
            <i
              key={live[i].t}
              className={v >= 0 ? "up" : "down"}
              style={{ height: `${Math.max(8, (Math.abs(v) / peakV) * 100)}%` }}
              title={`${live[i].t}: ${v >= 0 ? "+" : ""}${compact(v)}`}
            />
          ))}
        </div>
        <p className="muted tiny">Day-over-day change in sampled posts.</p>
      </div>
    </div>
  );
}
