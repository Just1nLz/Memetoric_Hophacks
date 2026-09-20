import {
  SAT_OVER,
  SAT_SWEET,
  interpretDay,
  phaseLabel,
  saturationCopy,
  saturationPct,
} from "../saturation";
import type { DayPoint } from "../types";

type Props = {
  point: DayPoint | null;
  title?: string;
  footnote?: string | null;
  showCopy?: boolean;
};

export function SaturationGauge({ point, title = "Saturation", footnote, showCopy = true }: Props) {
  const day = interpretDay(point);
  const pct = saturationPct(day?.saturation ?? null);
  const phase = day?.phase ?? "unknown";
  const uncovered = !day || phase === "uncovered" || pct == null;

  return (
    <div className={`sat-gauge phase-${phase}`}>
      <div className="sat-gauge-head">
        <p className="kicker tight">{title}</p>
        <p className="sat-gauge-read">
          {uncovered ? (
            <strong>—</strong>
          ) : (
            <>
              <strong>{pct}</strong>
              <span className={`sat-gauge-band phase-${phase}`}>{phaseLabel(phase)}</span>
            </>
          )}
        </p>
      </div>

      <div
        className="sat-gauge-track"
        role="meter"
        aria-label="Saturation"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={uncovered ? undefined : pct}
        aria-valuetext={uncovered ? "No coverage" : `${pct} · ${phaseLabel(phase)}`}
      >
        <span className="sat-tick sweet" style={{ left: `${SAT_SWEET}%` }} title="Sweet spot" />
        <span className="sat-tick over" style={{ left: `${SAT_OVER}%` }} title="Oversaturated" />
        {!uncovered && <span className="sat-needle" style={{ left: `${pct}%` }} />}
      </div>

      <div className="sat-gauge-axis" aria-hidden>
        <span>too few</span>
        <span className="sat-axis-sweet">50 · still funny</span>
        <span>80 · cringe</span>
      </div>

      {showCopy && <p className="sat-gauge-copy">{saturationCopy(day)}</p>}
      {footnote && <p className="sat-gauge-note">{footnote}</p>}
    </div>
  );
}
