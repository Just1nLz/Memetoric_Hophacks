import { useState } from "react";
import { compact, dayLabel } from "../format";
import {
  emptyMutations,
  interpretDay,
  interpretedSeries,
  phaseLabel,
  type DayMutations,
} from "../saturation";
import type { DayPoint } from "../types";

type VolumeProps = {
  series: DayPoint[];
  peakDay?: string | null;
  activeDay?: string | null;
  mutations?: Map<string, DayMutations>;
  onSelectDay?: (day: string) => void;
  onHoverDay?: (day: string | null) => void;
  defaultOpen?: boolean;
};

export function Volume({
  series,
  peakDay,
  activeDay,
  mutations,
  onSelectDay,
  onHoverDay,
  defaultOpen = false,
}: VolumeProps) {
  const [metric, setMetric] = useState<"tweets" | "likes">("tweets");
  const [hover, setHover] = useState<string | null>(null);
  const [open, setOpen] = useState(defaultOpen);
  const days = interpretedSeries(series);
  const live = days.filter((s) => s.coverage !== false);
  const max = Math.max(...live.map((s) => (metric === "tweets" ? s.tweets : s.likes)), 1);
  const maxMut = Math.max(1, ...[...(mutations?.values() ?? [])].map((m) => m.total));
  const focus =
    interpretDay(days.find((s) => s.t === (hover ?? activeDay))) ?? live.at(-1) ?? days.at(-1) ?? null;
  const first = series[0]?.t;
  const last = series.at(-1)?.t;
  const mut = focus ? mutations?.get(focus.t) ?? emptyMutations() : emptyMutations();
  const hasUncovered = series.some((s) => s.coverage === false);

  return (
    <div className={`volume-panel ${open ? "is-open" : "is-compact"}`}>
      <div className="volume-head">
        <button
          type="button"
          className="volume-toggle-panel"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="kicker">Daily volume</span>
          <span className="volume-chevron" aria-hidden>
            {open ? "▾" : "▸"}
          </span>
        </button>
        <div className="volume-toggle" role="group" aria-label="Volume metric">
          <button type="button" className={metric === "tweets" ? "on" : ""} onClick={() => setMetric("tweets")}>
            Posts
          </button>
          <button type="button" className={metric === "likes" ? "on" : ""} onClick={() => setMetric("likes")}>
            Likes
          </button>
        </div>
      </div>
      {open && (
        <p className="volume-help">
          Bar height is how often the phrase showed up that day. Color is where the month sat on the trend
          curve: lime is the pocket around 50; orange is 80+ oversaturated. Ticks under each bar are lineage
          events — a reply or quote is a real thread hop; a mutation recasts the same bit onto a new subject.
        </p>
      )}
      <div className="volume" role="img" aria-label="Daily usage bars">
        {days.map((s) => {
          const value = metric === "tweets" ? s.tweets : s.likes;
          const on = s.t === activeDay;
          const hot = s.t === hover;
          const loud = Boolean(peakDay && s.t === peakDay);
          const uncovered = s.coverage === false;
          const h = uncovered ? 6 : Math.max(4, (value / max) * 100);
          const dayMut = mutations?.get(s.t) ?? emptyMutations();
          const tickH = Math.max(3, (dayMut.total / maxMut) * 100);
          return (
            <button
              key={s.t}
              type="button"
              className={`bar-col phase-${s.phase ?? "unknown"} ${on ? "on" : ""} ${hot ? "hot" : ""} ${loud ? "loud" : ""} ${uncovered ? "uncovered" : ""}`}
              aria-label={`${dayLabel(s.t)} · ${s.tweets} posts · ${dayMut.total} tree events · ${phaseLabel(s.phase)}`}
              title={`${dayLabel(s.t)} · ${compact(s.tweets)} posts · ${dayMut.total} mutations · ${phaseLabel(s.phase)}`}
              onMouseEnter={() => {
                setHover(s.t);
                onHoverDay?.(s.t);
              }}
              onMouseLeave={() => {
                setHover(null);
                onHoverDay?.(null);
              }}
              onClick={() => !uncovered && onSelectDay?.(s.t)}
            >
              <div className="bar" style={{ height: `${h}%` }} />
              <div className="mut-ticks">
                <div className="mut-ticks-fill" style={{ width: `${dayMut.total ? tickH : 0}%` }}>
                  {dayMut.reply > 0 && <i className="mut-reply" style={{ flex: dayMut.reply }} />}
                  {dayMut.quote > 0 && <i className="mut-quote" style={{ flex: dayMut.quote }} />}
                  {dayMut.mutation > 0 && <i className="mut-mutation" style={{ flex: dayMut.mutation }} />}
                  {dayMut.origin > 0 && <i className="mut-origin" style={{ flex: dayMut.origin }} />}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {open && (
        <div className="sat-legend" aria-hidden>
          <i className="phase-emerging" /> under-exposed
          <i className="phase-building" /> building
          <i className="phase-trending" /> trending
          <i className="phase-cooling" /> cooling
          <i className="phase-oversaturated" /> oversaturated
          {hasUncovered && (
            <>
              <i className="phase-uncovered" /> no data
            </>
          )}
          <span className="mut-key">
            <i className="mut-reply" /> reply <i className="mut-quote" /> quote <i className="mut-mutation" /> mutation
          </span>
        </div>
      )}
      <div className="volume-foot">
        <span>{first ? dayLabel(first) : "—"}</span>
        <strong>
          {focus
            ? `${dayLabel(focus.t)} · ${compact(focus.tweets)} posts · ${mut.total} tree events · ${phaseLabel(focus.phase)}`
            : "Hover a day"}
        </strong>
        <span>{last ? dayLabel(last) : "—"}</span>
      </div>
      {open && focus && (
        <p className="sat-readout">
          {mut.total
            ? `Lineage this day: ${mut.quote} quotes, ${mut.reply} replies, ${mut.mutation} grafted.`
            : "No sampled tree posts landed this day."}
        </p>
      )}
    </div>
  );
}
