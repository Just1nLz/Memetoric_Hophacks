import { phaseLabel } from "../saturation";

type Props = {
  stamps: number[];
  index: number;
  playing: boolean;
  phase?: string;
  onIndex: (i: number) => void;
  onToggle: () => void;
};

export function Timeline({ stamps, index, playing, phase, onIndex, onToggle }: Props) {
  const t = stamps[index];
  const label = t
    ? new Date(t).toLocaleString(undefined, {
        timeZone: "UTC",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
  const pct = stamps.length < 2 ? 100 : (index / (stamps.length - 1)) * 100;

  return (
    <div className="timeline">
      <button className="play" onClick={onToggle} aria-label={playing ? "Pause" : "Play"}>
        {playing ? "Pause" : "Play"}
      </button>
      <div className="track">
        <input
          type="range"
          min={0}
          max={Math.max(stamps.length - 1, 0)}
          value={index}
          onChange={(e) => onIndex(Number(e.target.value))}
        />
        <div className="fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="time-readout">
        <span className="kicker">Timestep (UTC){phase ? ` · ${phaseLabel(phase)}` : ""}</span>
        <strong>
          {index + 1} / {stamps.length} · {label}
        </strong>
      </div>
    </div>
  );
}
