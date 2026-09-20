import { useState } from "react";
import { clipBody } from "../highlight";
import { bandLabel, influenceBins, scoreFamily } from "../influence";
import { latestCovered, phaseOf, type DayMutations } from "../saturation";
import type { DayPoint, TweetNode } from "../types";
import { Volume } from "./Charts";
import { IndexMeter } from "./InfluenceMeter";
import { SaturationGauge } from "./SaturationGauge";

type Props = {
  open: boolean;
  nodes: TweetNode[];
  series: DayPoint[];
  peakDay?: string | null;
  mutations?: Map<string, DayMutations>;
  activeDay?: string | null;
  selectedId?: string | null;
  onInspect: (id: string) => void;
  onSelectDay?: (day: string) => void;
  onClose: () => void;
};

export function AnalyticsPanel({
  open,
  nodes,
  series,
  peakDay,
  mutations,
  activeDay,
  selectedId,
  onInspect,
  onSelectDay,
  onClose,
}: Props) {
  const [hoverDay, setHoverDay] = useState<string | null>(null);
  if (!open) return null;
  const reports = scoreFamily(nodes);
  const ranked = [...nodes]
    .map((n) => ({ node: n, report: reports.get(n.id)! }))
    .filter((row) => row.report)
    .sort((a, b) => a.report.rank - b.report.rank || b.report.index - a.report.index);
  const top = ranked.slice(0, 8);
  const bins = influenceBins(ranked.map((r) => r.report));
  const peak = Math.max(1, ...bins);
  const selected = selectedId ? reports.get(selectedId) : null;
  const satPoint = phaseOf(series, hoverDay ?? activeDay) ?? latestCovered(series);

  return (
    <div className="analytics-sheet" role="dialog" aria-label="Meme analytics">
      <header className="analytics-head">
        <div>
          <p className="kicker">Analytics</p>
          <h2>Saturation and influence</h2>
        </div>
        <button type="button" className="icon-btn" aria-label="Close analytics" onClick={onClose}>
          ×
        </button>
      </header>

      <SaturationGauge
        point={satPoint}
        title={hoverDay || activeDay ? "Saturation · this day" : "Saturation · end of covered month"}
      />
      <p className="sat-primer">
        Saturation is how far the joke has travelled this month. <strong>50 is the sweet spot</strong> — enough
        people have seen it, and they still like using it. Below ~25, not enough exposure. At 80+, it is
        oversaturated: using it reads as cringe, and a brand pairing a product with it usually backfires.
      </p>

      <Volume
        series={series}
        peakDay={peakDay}
        mutations={mutations}
        activeDay={activeDay}
        onSelectDay={onSelectDay}
        onHoverDay={setHoverDay}
        defaultOpen
      />

      <div className="influence-primer">
        <p className="kicker">Influence index</p>
        <p className="kicker">How the index is scored</p>
        <p>
          A 0–100 prior for how hard a post hit this family — use it to pick what to read next, not as a
          verdict. Quotes weigh most (they recast the bit), then reposts, replies, saves, likes. Views count
          as clicks but are log-diluted so reach alone cannot look like impact. 100 is the hardest-hitting
          post in this family.
        </p>
        <p className="formula">I = 100 · ln(1+R) / ln(1+R<sub>max</sub>) · R = 4Q + 2.8S + 2.2C + 1.6B + L + ln(1+V)</p>
      </div>

      <div className="influence-dist" aria-hidden>
        {bins.map((n, i) => (
          <i
            key={i}
            style={{ height: `${Math.max(8, (n / peak) * 100)}%` }}
            title={`${i * 10}–${i * 10 + 10}: ${n} posts`}
          />
        ))}
      </div>
      <p className="muted tiny dist-caption">Family distribution · 0 on the left, 100 on the right</p>

      {selected && (
        <p className="selected-idx">
          Selected post is <strong>{selected.index}</strong> · {bandLabel(selected.band)} · rank {selected.rank} of{" "}
          {selected.of}
        </p>
      )}

      <p className="kicker lead-kicker">Investigation leads</p>
      <ol className="influence-leads">
        {top.map(({ node, report }) => (
          <li key={node.id}>
            <button
              type="button"
              className={node.id === selectedId ? "on" : ""}
              onClick={() => onInspect(node.id)}
            >
              <span className="lead-rank">#{report.rank}</span>
              <span className="lead-body">
                <strong>
                  {report.index} · {bandLabel(report.band)}
                </strong>
                <span>{clipBody(node.body, 72)}</span>
              </span>
              <IndexMeter report={report} compact />
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
