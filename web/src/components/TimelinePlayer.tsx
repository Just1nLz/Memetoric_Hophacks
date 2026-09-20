import { dayLabel } from "../format";

type Props = {
  stamps: number[];
  index: number;
  playing: boolean;
  speed: number;
  generation: number;
  generationMax: number;
  onIndex: (i: number) => void;
  onToggle: () => void;
  onSpeed: (s: number) => void;
};

export function TimelinePlayer({
  stamps,
  index,
  playing,
  speed,
  generation,
  generationMax,
  onIndex,
  onToggle,
  onSpeed,
}: Props) {
  const t = stamps[index];
  const first = stamps[0];
  const last = stamps.at(-1);
  const pct = stamps.length < 2 ? 100 : (index / (stamps.length - 1)) * 100;

  return (
    <div className="timeline-player">
      <button className="play" type="button" onClick={onToggle} aria-label={playing ? "Pause" : "Play"}>
        {playing ? "Pause" : "Play"}
      </button>
      <div className="timeline-main">
        <div className="track">
          <input
            type="range"
            min={0}
            max={Math.max(stamps.length - 1, 0)}
            value={index}
            onChange={(e) => onIndex(Number(e.target.value))}
            aria-label="Lineage time"
          />
          <div className="fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="timeline-ends">
          <span>{first ? stampDay(first) : "—"}</span>
          <span>{last ? stampDay(last) : "—"}</span>
        </div>
      </div>
      <div className="timeline-meta">
        <strong>
          Generation {generation} / {generationMax}
        </strong>
        <span className="timeline-clock">{t ? stampClock(t) : "—"}</span>
        <div className="speed-row" role="group" aria-label="Playback speed">
          {[0.5, 1, 2].map((s) => (
            <button key={s} type="button" className={speed === s ? "on" : ""} onClick={() => onSpeed(s)}>
              {s}×
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function stampDay(ms: number): string {
  return dayLabel(new Date(ms).toISOString());
}

function stampClock(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
