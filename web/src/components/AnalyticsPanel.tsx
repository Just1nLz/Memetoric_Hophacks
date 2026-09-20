import { useState } from "react";
import { clipBody } from "../highlight";
import { bandLabel, influenceBins, scoreFamily } from "../influence";
import { latestCovered, phaseOf, type DayMutations } from "../saturation";
import type { DayPoint, TweetNode } from "../types";
import { Volume } from "./Charts";
import { IndexMeter } from "./InfluenceMeter";
import { SaturationGauge } from "./SaturationGauge";

type Pane = "saturation" | "influence" | "method";

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

const PANES: { id: Pane; label: string }[] = [
  { id: "saturation", label: "Saturation" },
  { id: "influence", label: "Influence" },
  { id: "method", label: "Method" },
];

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
  const [pane, setPane] = useState<Pane>("saturation");
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
          <h2>{PANES.find((p) => p.id === pane)?.label}</h2>
        </div>
        <button type="button" className="icon-btn" aria-label="Close analytics" onClick={onClose}>
          ×
        </button>
      </header>

      <div className="analytics-tabs" role="tablist" aria-label="Analytics views">
        {PANES.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={pane === p.id}
            className={pane === p.id ? "on" : ""}
            onClick={() => setPane(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {pane === "saturation" && (
        <div className="analytics-pane">
          <SaturationGauge
            point={satPoint}
            title={hoverDay || activeDay ? "Saturation · this day" : "Saturation · end of covered month"}
            showCopy={false}
          />
          <p className="sat-primer">
            How far the joke has travelled this month. <strong>50 is still funny</strong>. 80+ reads as spent.
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
        </div>
      )}

      {pane === "influence" && (
        <div className="analytics-pane">
          {selected ? (
            <p className="selected-idx">
              Selected post is <strong>{selected.index}</strong> · {bandLabel(selected.band)} · rank {selected.rank} of{" "}
              {selected.of}
            </p>
          ) : (
            <p className="muted small analytics-lede">
              How hard a post hit this family — a prior for what to read next, not a verdict.
            </p>
          )}
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
      )}

      {pane === "method" && (
        <div className="analytics-pane method-pane">
          <div className="influence-primer">
            <p className="kicker">Saturation</p>
            <p>
              Cumulative monthly phrase volume, 0–100. <strong>50 is the sweet spot</strong> — enough people have
              seen it, and they still like using it. Below ~25, not enough exposure. At 80+, it is oversaturated:
              using it reads as cringe, and a brand pairing a product with it usually backfires. Orthogonal to
              influence: a quiet post can land in a hot month, and a loud post can land after the joke is spent.
            </p>
          </div>
          <div className="influence-primer">
            <p className="kicker">Influence index</p>
            <p>
              A 0–100 prior for how hard a post hit this family. Quotes weigh most (they recast the bit), then
              reposts, replies, saves, likes. Views count as clicks but are log-diluted so reach alone cannot look
              like impact. 100 is the hardest-hitting post in this family.
            </p>
            <p className="formula">
              I = 100 · ln(1+R) / ln(1+R<sub>max</sub>) · R = 4Q + 2.8S + 2.2C + 1.6B + L + ln(1+V)
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
